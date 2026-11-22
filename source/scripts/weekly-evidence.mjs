import { canonicalUrl, isoDate, sourceUrl } from '../editorial/edition.mjs';
import {bandcampAlbum} from './bandcamp-albums.mjs';
import {listeningResolver} from './album-links.mjs';
import { text } from './discovery-feeds.mjs';
import { livePerformer } from './recommendation-policy.mjs';

import { readPublicPage, albumListeningLink } from './album-catalogues.mjs';

import { normalized, primaryReleaseDate } from './release-metadata.mjs';
export { normalized, primaryReleaseDate } from './release-metadata.mjs';

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
  const resolveListening=listeningResolver(fetcher);
  for (const record of records) {
    const primary = sourceUrl(record.sourceUrl);
    let candidate;
    let verifiedReleaseDate;
    let failure = 'Source primaire inaccessible';
    try {
      if (!primary || !text(record.title) || !text(record.creator)) throw new Error();
      const html = record.evidenceHtml ?? await readPublicPage(primary.href, fetcher);
      failure = 'Date originale ou identité non confirmée';
      const structuredDate = primaryReleaseDate(html, record);
      if (record.releaseDate && structuredDate && record.releaseDate !== structuredDate) throw new Error();
      const releaseDate = record.releaseDate ?? structuredDate;
      if(record.method==='bandcamp-album' && (!structuredDate || !bandcampAlbum(html,primary.href,record.label)))throw new Error();
      if (/\b(reissue|remaster(?:ed)?|anniversary|deluxe|expanded)\b/i.test(record.title)) throw new Error();
      if (!releaseDate) throw new Error();
      verifiedReleaseDate = releaseDate;
      failure = 'Lien Spotify de cet album non confirmé';
      const links = new Set([...html.matchAll(/href\s*=\s*["'](https:\/\/open\.spotify\.com\/album\/[a-zA-Z0-9]{22})(?=[?/#"'])/gi)].map(match => match[1]));
      const listening=record.url ? {url:record.url,proof:record.listeningProofUrl??primary.href} : await resolveListening({...record,evidenceHtml:html});
      failure=listening.reason ?? failure;
      const spotify = sourceUrl(listening.url ?? albumListeningLink(html) ?? (links.size === 1 ? [...links][0] : undefined));
      const albumId = spotify?.origin === 'https://open.spotify.com' && spotify.pathname.match(/^\/album\/([a-zA-Z0-9]{22})$/)?.[1];
      if (!albumId) throw new Error();
      const oembedUrl='https://open.spotify.com/oembed?url=' + encodeURIComponent(spotify.href);
      const embed = await fetcher(oembedUrl,
        { signal: AbortSignal.timeout(10_000), redirect: 'error' });
      if (!embed.ok) throw new Error();
      const metadata = await embed.json();
      if (normalized(metadata.title) !== normalized(record.title)
        || metadata.provider_name && metadata.provider_name !== 'Spotify'
        || canonicalUrl(metadata.iframe_url) !== 'https://open.spotify.com/embed/album/' + albumId) throw new Error();
      candidate = {
        id: 'spotify-' + albumId, title: record.title, creator: record.creator, source: record.label,
        provider: record.label, format: 'Album', url: spotify.href, sourceUrl: primary.href,
        releaseDate, releaseProofUrl: record.dateProofUrl ?? primary.href, date: releaseDate, dateKind: 'release', verificationStatus: 'primary-verified',
        embed: { provider: 'spotify', id: albumId }, listeningProofUrl:oembedUrl,listeningMappingUrl:record.url?record.listeningMappingUrl:listening.proof, tags:record.tags ?? [],
        editorialSource:record.editorialSource,editorialUrl:record.editorialUrl,editorialKind:record.editorialKind,
      };
    } catch { /* A blocked or ambiguous source cannot confirm an original release. */ }
    results.push({ title: record.title, creator:record.creator, sourceUrl: record.sourceUrl, candidate, verifiedReleaseDate, ...(!candidate && {reason: failure}) });
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
  let failure = 'Métadonnées YouTube invalides';
  try {
    for (let offset = 0; offset < ids.length; offset += 50) {
      const query = new URLSearchParams({ part: 'contentDetails,status,snippet', id: ids.slice(offset, offset + 50).join(',') });
      const response = await fetcher('https://www.googleapis.com/youtube/v3/videos?' + query,
        { headers: { 'x-goog-api-key': key }, signal: AbortSignal.timeout(10_000), redirect: 'error' });
      if (!response.ok) { failure = 'YouTube Data API HTTP ' + response.status; throw new Error(); }
      for (const video of (await response.json()).items) {
        const item = byId.get(video.id);
        const duration = seconds(video.contentDetails?.duration);
        const title = video.snippet?.title ?? '';
        if (!item || video.snippet?.channelId !== channels.get(item.sourceId) || video.status?.embeddable !== true
          || video.status.privacyStatus !== 'public' || video.snippet.liveBroadcastContent !== 'none' || duration <= 180
          || /\b(interview|shorts?|teaser|trailer|extrait|clip|official music video|behind the scenes)\b/i.test(title)) continue;
        items.push({ ...item, title, creator: livePerformer(title,item.creator), minutes: duration / 60, verificationStatus: 'performance-verified' });
      }
    }
  } catch {
    return { items, status: failure + '. Les vidéos sans preuve restent à vérifier.' };
  }
  return { items, status: items.length + ' vidéo(s) publique(s) intégrable(s), de plus de trois minutes, sur une chaîne officielle.' };
}
