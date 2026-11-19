import { isoDate } from '../editorial/edition.mjs';
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

