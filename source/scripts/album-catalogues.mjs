import { isoDate, sourceUrl } from '../editorial/edition.mjs';
import { normalized, primaryReleaseDate } from './release-metadata.mjs';

export const plain = value => value.replace(/<[^>]*>/g, ' ').replace(/&amp;/g, '&').replace(/&#39;/g, "'")
  .replace(/&quot;/g, '"').replace(/\s+/g, ' ').trim();
const reissue = /\b(reissue|remaster(?:ed)?|anniversary|deluxe|expanded)\b/i;
const agent = 'BonnesOndes/1.0 (+https://github.com/haniadaher21-ops/bonnesondes)';

export async function readPublicPage(url, fetcher = fetch) {
  const target = sourceUrl(url);
  if (!target || target.port) throw new Error('Source HTTPS invalide.');
  const response = await fetcher(target.href, {headers: {'User-Agent': agent}, redirect: 'error', signal: AbortSignal.timeout(12000)});
  if (!response.ok) {
    await response.body?.cancel();
    throw new Error('HTTP ' + response.status);
  }
  const reader = response.body?.getReader();
  if (!reader) throw new Error('Réponse vide.');
  const chunks = [];
  let bytes = 0;
  try {
    for (;;) {
      const {value, done} = await reader.read();
      if (done) break;
      bytes += value.length;
      if (bytes > 4_000_000) throw new Error('Page trop volumineuse.');
      chunks.push(value);
    }
  } finally {
    await reader.cancel();
  }
  return Buffer.concat(chunks).toString('utf8');
}

// The label's own table supplies artist, release type, and release date.
export function ninjaCatalogue(html, origin = 'https://old.ninjatune.net') {
  const rows = [];
  for (const match of html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const cell = name => match[1].match(new RegExp('<td\\b[^>]*class="' + name + '"[^>]*>([\\s\\S]*?)<\\/td>', 'i'))?.[1] ?? '';
    const title = plain(cell('title'));
    const creator = plain(cell('artist'));
    const release = plain(cell('release_date')).match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    const path = cell('title').match(/href="(\/release\/[^"?#]+)"/)?.[1];
    if (plain(cell('type')) !== 'Album' || !title || !creator || !path || !release || reissue.test(title)) continue;
    const date = release[3] + '-' + release[2] + '-' + release[1];
    if (!isoDate(date)) continue;
    rows.push({ title, creator, label: plain(cell('label')) || 'Ninja Tune', sourceUrl: origin + path,
      releaseDate: date, dateProofUrl: origin + '/widget/releases/catalogue/page:1/view:list/type:record' });
  }
  return rows;
}

export function subpopCatalogue(html) {
  const rows = [];
  for (const match of html.matchAll(/<article\b[^>]*class="release[^"]*"[^>]*>([\s\S]*?)<\/article>/gi)) {
    const field = name => match[1].match(new RegExp('<(?:h3|span)\\b[^>]*class="' + name + '"[^>]*>([\\s\\S]*?)<\\/(?:h3|span)>', 'i'))?.[1] ?? '';
    const title = plain(field('release-name'));
    const creator = plain(field('artist-name'));
    const href = field('release-name').match(/href="(\/releases\/[^"?#]+)"/)?.[1];
    const stamp = Date.parse(plain(field('release-date')) + ' UTC');
    if (!title || !creator || !href || !Number.isFinite(stamp) || reissue.test(title)) continue;
    // The release page must additionally confirm MusicAlbum identity and date.
    rows.push({title, creator, label: 'Sub Pop', sourceUrl: 'https://www.subpop.com' + href,
      catalogueDate: new Date(stamp).toISOString().slice(0, 10), dateProofUrl: 'https://www.subpop.com/releases'});
  }
  return rows;
}

export function ecmRelease(html, sourceUrl) {
  const title = plain(html.match(/<h1\b[^>]*class="album_tile[^"]*"[^>]*>([\s\S]*?)<\/h1>/i)?.[1] ?? '');
  const creator = plain(html.match(/<h2\b[^>]*class="album_artist[^"]*"[^>]*>([\s\S]*?)<\/h2>/i)?.[1] ?? '');
  const date = plain(html.match(/<p\b[^>]*class="original_release_date"[^>]*>([\s\S]*?)<\/p>/i)?.[1] ?? '').match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  const releaseDate = date && date[3]+'-'+date[2]+'-'+date[1];
  if (!title || !creator || !isoDate(releaseDate) || reissue.test(title)) return;
  return {title,creator,label:'ECM',releaseDate,sourceUrl,dateProofUrl:sourceUrl,evidenceHtml:html};
}

export async function collectAlbumCatalogues({startsOn, today, fetcher = fetch}) {
  const windowStart = new Date(Date.parse(startsOn) - 14 * 86400000).toISOString().slice(0, 10);
  const sources = [
    {name: 'Ninja Tune', url: 'https://old.ninjatune.net/widget/releases/catalogue/page%3A1/view%3Alist/type%3Arecord', parse: ninjaCatalogue},
    {name: 'Sub Pop', url: 'https://www.subpop.com/releases', parse: subpopCatalogue},
  ];
  const records = [];
  const status = [];
  for (const source of sources) {
    try {
      const parsed = source.parse(await readPublicPage(source.url, fetcher));
      let checked = 0;
      for (const record of parsed.filter(item => {
        const date = item.releaseDate ?? item.catalogueDate;
        return date >= windowStart && date <= today;
      }).slice(0, 15)) {
        try {
          const html = await readPublicPage(record.sourceUrl, fetcher);
          const structured = primaryReleaseDate(html, record);
          const date = record.releaseDate ?? structured;
          if (!date || (structured && structured !== date)) continue;
          if (normalized(plain(html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1] ?? '')).includes(normalized(record.title)) === false
            && !structured) continue;
          if (record.catalogueDate && date !== record.catalogueDate) continue;
          records.push({...record, releaseDate: date, evidenceHtml: html});
          checked++;
        } catch { /* Try another release rather than treating an announcement as evidence. */ }
      }
      status.push({source: source.name, albums: parsed.length, eligibleVerified: checked, status: 'ok'});
    } catch (error) {
      status.push({source: source.name, status: 'unavailable', reason: error.message, albums: 0, eligibleVerified: 0});
    }
  }
  try {
    const page = await readPublicPage('https://ecmrecords.com/',fetcher);
    const urls = [...new Set([...page.matchAll(/href="(https:\/\/ecmrecords\.com\/product\/[^"?#]+)"/g)].map(match=>match[1]))].slice(0,20);
    let checked = 0;
    for (const url of urls) {
      try {
        const html = await readPublicPage(url,fetcher);
        const record = ecmRelease(html,url);
        if (record && record.releaseDate >= windowStart && record.releaseDate <= today) {
          records.push(record); checked++;
        }
      } catch { /* Keep other catalogue results if a product is unavailable. */ }
    }
    status.push({source:'ECM',albums:urls.length,eligibleVerified:checked,status:'ok'});
  } catch(error) {
    status.push({source:'ECM',albums:0,eligibleVerified:0,status:'unavailable',reason:error.message});
  }
  return {records, status};
}

export function albumListeningLink(html) {
  const links = [...new Set([...html.matchAll(/https:\/\/open\.spotify\.com\/(?:intl-[a-z]+\/)?album\/[a-zA-Z0-9]{22}/g)].map(match => match[0]))];
  return links.length === 1 ? links[0] : undefined;
}
