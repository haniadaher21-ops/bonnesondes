import { XMLParser, XMLValidator } from 'fast-xml-parser';
import { canonicalUrl, isoDate, sourceUrl } from '../editorial/edition.mjs';
import { isDedicatedNovaMixEpisode } from './nova-mixes.mjs';

export const text = value => typeof value === 'string' ? value.trim() : '';
const array = value => [value].flat().filter(Boolean);
const parser = new XMLParser({
  ignoreAttributes: false, parseTagValue: false, maxNestedTags: 40,
  isArray: tag => ['entry', 'item'].includes(tag),
});

export function parseFeed(xml) {
  if (xml.length > 5_000_000 || /<!DOCTYPE|<!ENTITY/i.test(xml) || XMLValidator.validate(xml) !== true) {
    throw new Error('Flux XML invalide.');
  }
  return parser.parse(xml);
}

export function publishedDate(value) {
  if (!text(value) || !Number.isFinite(Date.parse(value))) return {};
  const publishedAt = new Date(value).toISOString();
  return { publishedAt, date: publishedAt.slice(0, 10), dateKind: 'published' };
}

function primaryLink(value, source) {
  const url = sourceUrl(value);
  if (!url || url.hostname.replace(/^www\./, '') !== new URL(source.url).hostname.replace(/^www\./, '')
    || !url.pathname.startsWith(source.itemPrefix) || url.pathname.replace(/\/$/, '') === source.itemPrefix.replace(/\/$/, '')) return;
  return canonicalUrl(url.href);
}

export function spotifyPlaylistId(value) {
  const url = sourceUrl(value);
  if (url?.hostname !== 'open.spotify.com' || url.port) return;
  return url.pathname.match(/^\/(?:intl-[a-z]+\/)?playlist\/([a-zA-Z0-9]{22})\/?$/)?.[1];
}

export function spotifyCandidate(url, sourceUrl) {
  const id = spotifyPlaylistId(url);
  if (!id) return;
  return {
    id: 'spotify-' + id, format: 'Playlist', url: 'https://open.spotify.com/playlist/' + id,
    sourceUrl, embed: { provider: 'spotify', id },
  };
}

export function editorialFeed(xml, source) {
  const parsed = parseFeed(xml);
  const atom = source.method === 'label-atom';
  const entries = atom ? parsed.feed?.entry : parsed.rss?.channel?.item;
  if (!(atom ? parsed.feed : parsed.rss?.channel)) throw new Error('Structure de flux inattendue.');
  const candidates = [];
  const leads = [];
  for (const entry of (entries ?? []).slice(0, source.mixSelection ? 32 : 8)) {
    const href = atom ? array(entry.link).find(link => link['@_rel'] === 'alternate')?.['@_href'] : entry.link;
    const url = primaryLink(href, source);
    const title = text(entry.title?.['#text'] ?? entry.title);
    const dates = publishedDate(atom ? entry.published : entry.pubDate);
    if (!url || !title || !dates.date) continue;
    if(source.mixSelection && !isDedicatedNovaMixEpisode(title,source.mixSelection)) continue;
    const item = { title, url, ...dates };
    switch (source.method) {
      case 'podcast-rss':
        candidates.push({ ...item, id: source.id + ':' + new URL(url).pathname, format: 'Radio show' });
        break;
      case 'pitchfork-rss':
        candidates.push({ ...item, id: 'pitchfork:' + new URL(url).pathname, format: 'Album', verificationStatus: 'release-date-needed' });
        break;
      default: {
        const html = [entry.content, entry['content:encoded'], entry.description].map(value => text(value?.['#text'] ?? value)).join(' ');
        const links = [...html.matchAll(/href\s*=\s*["'](https:\/\/[^"'\s<>]+)["']/gi)].map(match => match[1].replace(/&amp;/g, '&'));
        const bandcampUrls = [...new Set(links.flatMap(link => {
          const target = sourceUrl(link);
          return target && /^[-a-z0-9]+\.bandcamp\.com$/i.test(target.hostname) && /^\/album\/[\w-]+\/?$/.test(target.pathname)
            ? [target.origin + target.pathname] : [];
        }))];
        const record = !atom && /^I Love This Record\s*[-–—]\s*["“](.+?)["”]\s+by\s+(.+)$/i.exec(title);
        if (record) {
          const [, album, artist] = record;
          candidates.push({
            ...item, id: 'bandcamp-notes:' + new URL(url).pathname, title: album, creator: artist,
            format: 'Album', bandcampUrls, verificationStatus: 'release-date-needed',
          });
        } else {
          leads.push({ ...item, id: source.id + ':' + new URL(url).pathname,
            kind: atom ? 'label-news' : 'bandcamp-editorial', bandcampUrls });
        }
        const playlists = links.map(link => spotifyCandidate(link, url)).filter(Boolean).slice(0, 3);
        candidates.push(...playlists);
      }
    }
  }
  return { candidates, leads };
}

export function reviewedArtist(html, title) {
  for (const script of html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const reviewed = JSON.parse(script[1])?.itemReviewed;
      const name = text(reviewed?.name);
      const suffix = ': ' + title;
      const artist = text(reviewed?.byArtist?.name);
      if (artist) return artist;
      if (name.endsWith(suffix)) return name.slice(0, -suffix.length).trim() || undefined;
    } catch { /* Other structured data may still be available. */ }
  }
}
