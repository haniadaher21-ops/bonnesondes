import { isoDate } from '../editorial/edition.mjs';
import {releaseDayArticle} from './label-news.mjs';
import { text } from './discovery-feeds.mjs';

export const normalized = value => text(value).normalize('NFKD').replace(/\p{M}/gu, '')
  .toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

export function primaryReleaseDate(html, record) {
  const dates = new Set();
  if(record.method==='label-release-day') {
    const parsed=releaseDayArticle(html,record.sourceUrl,record.label);
    if(parsed && normalized(parsed.title)===normalized(record.title) && normalized(parsed.creator)===normalized(record.creator))return parsed.releaseDate;
    return;
  }
  if (record.method === 'bandcamp-album') {
    // Bandcamp's explicit album_release_date must agree with its album JSON-LD, never the upload date.
    try {
      const raw=html.match(/data-tralbum=["']([\s\S]*?)["']\s/i)?.[1];
      const tralbum=JSON.parse(raw.replace(/&quot;/g,'"').replace(/&#0?39;/g,"'").replace(/&amp;/g,'&'));
      if(normalized(tralbum.artist)!==normalized(record.creator)||normalized(tralbum.current?.title)!==normalized(record.title))return;
      const date=new Date(tralbum.album_release_date);
      if(Number.isFinite(+date))dates.add(date.toISOString().slice(0,10));
    }catch{return;}
  }
  for (const script of html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const data = JSON.parse(script[1]);
      for (const node of [data, data?.['@graph'] ?? []].flat(2)) {
        if (![node?.['@type']].flat().includes('MusicAlbum')
          || normalized(node.name) !== normalized(record.title)
          || ![node.byArtist].flat().some(artist => normalized(artist?.name) === normalized(record.creator))) continue;
        const date = node.datePublished;
        if (isoDate(date)) dates.add(date);
        else if(record.method==='bandcamp-album' && Number.isFinite(Date.parse(date))) dates.add(new Date(date).toISOString().slice(0,10));
      }
    } catch { /* Individual structured data blocks can be malformed. */ }
  }
  if (record.method === 'rhymesayers-release') {
    const visible = html.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, '').replace(/<[^>]+>/g, ' ');
    const heading = html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1]?.replace(/<[^>]+>/g, ' ');
    const identity = normalized(heading);
    if (identity.includes(normalized(record.title)) && record.creator.split(/\s+(?:x|and)\s+|\s*&\s*/i).every(artist=>identity.includes(normalized(artist)))
      && /\b(?:new|debut|collaborative) album\b/i.test(visible)) {
      for (const match of visible.matchAll(/\b(?:Releases|Release Date:)\s+([A-Z][a-z]+ \d{1,2}, \d{4})/g)) {
        const timestamp = Date.parse(match[1] + ' UTC');
        if (Number.isFinite(timestamp)) dates.add(new Date(timestamp).toISOString().slice(0, 10));
      }
    }
  }
  return dates.size === 1 ? [...dates][0] : undefined;
}

// Conflicting primary dates block the album even when one source cannot resolve its Spotify link.
export function filterConflictingDates(evidence) {
  const dates=new Map();
  const key=row=>normalized(row.creator)+':'+normalized(row.title);
  for(const row of evidence) {
    if(!isoDate(row.verifiedReleaseDate))continue;
    if(!dates.has(key(row)))dates.set(key(row),new Set());
    dates.get(key(row)).add(row.verifiedReleaseDate);
  }
  return evidence.map(row=>dates.get(key(row))?.size>1
    ? {...row,candidate:undefined,reason:'Dates originales contradictoires'} : row);
}
