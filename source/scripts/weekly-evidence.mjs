import { canonicalUrl, isoDate, sourceUrl } from '../editorial/edition.mjs';
import { text } from './discovery-feeds.mjs';

export const normalized = value => text(value).normalize('NFKD').replace(/\p{M}/gu, '')
  .toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

export function primaryReleaseDate(html, record) {
  const dates = new Set();
  for (const script of html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const data = JSON.parse(script[1]);
      for (const node of [data, data?.['@graph'] ?? []].flat(2)) {
        if (![node?.['@type']].flat().includes('MusicAlbum')
          || normalized(node.name) !== normalized(record.title)
          || ![node.byArtist].flat().some(artist => normalized(artist?.name) === normalized(record.creator))) continue;
        const date = node.datePublished;
        if (isoDate(date)) dates.add(date);
      }
    } catch { /* Individual structured data blocks can be malformed. */ }
  }
  if (record.method === 'rhymesayers-release') {
    const visible = html.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, '').replace(/<[^>]+>/g, ' ');
    const heading = html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1]?.replace(/<[^>]+>/g, ' ');
    const identity = normalized(heading);
    if (identity.includes(normalized(record.title)) && identity.includes('aesop rock') && identity.includes('blockhead')
      && /\bnew album from Aesop Rock and Blockhead\b/i.test(visible)) {
      for (const match of visible.matchAll(/\bReleases\s+([A-Z][a-z]+ \d{1,2}, \d{4})\./g)) {
        const timestamp = Date.parse(match[1] + ' UTC');
        if (Number.isFinite(timestamp)) dates.add(new Date(timestamp).toISOString().slice(0, 10));
      }
    }
  }
  return dates.size === 1 ? [...dates][0] : undefined;
}

// Allowed hosts publish releases directly. Editorial and retail sites are not release evidence.
const primaryPaths = new Map([
  ['rhymesayers.com', /^\/(?:products|blogs\/news)\//],
  ['www.subpop.com', /^\/releases\//],
  ['ninjatune.net', /^\/release\//],
  ['www.ninjatune.net', /^\/release\//],
  ['downloads.ninjatune.net', /^\/release\//],
  ['ghostly.com', /^\/releases\//],
]);

export function linkedReleaseSources(html) {
  return [...new Set([...html.matchAll(/href\s*=\s*["'](https:\/\/[^"'\s<>]+)["']/gi)].flatMap(match => {
    const url = sourceUrl(match[1]);
    if (!url || url.port || !primaryPaths.get(url.hostname)?.test(url.pathname)) return [];
    return [url.origin + url.pathname];
  }))].slice(0, 2);
}

export async function verifyAlbums(records, fetcher = fetch) {
  const results = [];
  for (const record of records) {
    const primary = sourceUrl(record.sourceUrl);
    let candidate;
    try {
      if (!primary || !text(record.title) || !text(record.creator)) throw new Error();
      const page = await fetcher(primary.href, { signal: AbortSignal.timeout(10_000), redirect: 'error' });
      if (!page.ok) throw new Error();
      const html = await page.text();
      const releaseDate = primaryReleaseDate(html, record);
      if (!releaseDate) throw new Error();
      const links = new Set([...html.matchAll(/href\s*=\s*["'](https:\/\/open\.spotify\.com\/album\/[a-zA-Z0-9]{22})(?=[?/#"'])/gi)].map(match => match[1]));
      const spotify = sourceUrl(record.url ?? (links.size === 1 ? [...links][0] : undefined));
      const albumId = spotify?.origin === 'https://open.spotify.com' && spotify.pathname.match(/^\/album\/([a-zA-Z0-9]{22})$/)?.[1];
      if (!albumId) throw new Error();
      const embed = await fetcher('https://open.spotify.com/oembed?url=' + encodeURIComponent(spotify.href),
        { signal: AbortSignal.timeout(10_000), redirect: 'error' });
      if (!embed.ok) throw new Error();
      const metadata = await embed.json();
      if (normalized(metadata.title) !== normalized(record.title)
        || canonicalUrl(metadata.iframe_url) !== 'https://open.spotify.com/embed/album/' + albumId) throw new Error();
      candidate = {
        id: 'spotify-' + albumId, title: record.title, creator: record.creator, source: record.label,
        provider: record.label, format: 'Album', url: spotify.href, sourceUrl: primary.href,
        releaseDate, date: releaseDate, dateKind: 'release', verificationStatus: 'primary-verified',
        embed: { provider: 'spotify', id: albumId },
      };
    } catch { /* A blocked or ambiguous source cannot confirm an original release. */ }
    results.push({ title: record.title, sourceUrl: record.sourceUrl, candidate });
  }
  return results;
}

function seconds(duration) {
  const match = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(duration ?? '');
  return match ? Number(match[1] ?? 0) * 3600 + Number(match[2] ?? 0) * 60 + Number(match[3] ?? 0) : 0;
}

export async function verifyLives(candidates, sources, key, fetcher = fetch) {
  if (!key) return { items: [], status: 'Clé YouTube Data API absente. Durée des sessions non confirmée.' };
  const channels = new Map(sources.filter(source => source.method === 'youtube-atom').map(source => [source.id, source.channelId]));
  const byId = new Map(candidates.filter(item => item.format === 'Live session' && item.officialVideo
    && item.embed?.provider === 'youtube' && /^[\w-]{11}$/.test(item.embed.id) && channels.has(item.sourceId)
    && canonicalUrl(item.url) === 'https://www.youtube.com/watch?v=' + item.embed.id).map(item => [item.embed.id, item]));
  const items = [];
  const ids = [...byId.keys()];
  try {
    for (let offset = 0; offset < ids.length; offset += 50) {
      const query = new URLSearchParams({ part: 'contentDetails,status,snippet', id: ids.slice(offset, offset + 50).join(',') });
      const response = await fetcher('https://www.googleapis.com/youtube/v3/videos?' + query,
        { headers: { 'x-goog-api-key': key }, signal: AbortSignal.timeout(10_000), redirect: 'error' });
      if (!response.ok) throw new Error();
      for (const video of (await response.json()).items) {
        const item = byId.get(video.id);
        const duration = seconds(video.contentDetails?.duration);
        const title = video.snippet?.title ?? '';
        if (!item || video.snippet?.channelId !== channels.get(item.sourceId) || video.status?.embeddable !== true
          || video.status.privacyStatus !== 'public' || video.snippet.liveBroadcastContent !== 'none' || duration <= 180
          || /\b(interview|shorts?|teaser|trailer|extrait|clip|official music video|behind the scenes)\b/i.test(title)) continue;
        items.push({ ...item, minutes: duration / 60, verificationStatus: 'performance-verified' });
      }
    }
  } catch {
    return { items, status: 'Métadonnées YouTube incomplètes. Les vidéos sans preuve restent à vérifier.' };
  }
  return { items, status: items.length + ' vidéo(s) publique(s) intégrable(s), de plus de trois minutes, sur une chaîne officielle.' };
}
