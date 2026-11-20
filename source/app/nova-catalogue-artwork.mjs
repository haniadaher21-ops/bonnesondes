import { radioArtworkUrl } from './radio-artwork.mjs';

// Apple's public catalogue returns cover artwork, but only use it when BOTH
// artist and song title match. Never substitute a similar song or a remix.
const entries = new Map();
const TTL_MS = 30 * 60 * 1000;

export function normalizeRecording(value) {
  if (typeof value !== 'string') return '';
  return value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[’']/g, '').replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ');
}

export function exactCatalogueArtwork(results, artist, title) {
  if (!Array.isArray(results)) return null;
  const wantedArtist = normalizeRecording(artist);
  const wantedTitle = normalizeRecording(title);
  if (!wantedArtist || !wantedTitle) return null;
  const found = results.find(row =>
    row && row.kind === 'song' &&
    normalizeRecording(row.artistName) === wantedArtist &&
    normalizeRecording(row.trackName) === wantedTitle &&
    radioArtworkUrl(row.artworkUrl100) &&
    radioArtworkUrl(row.trackViewUrl)
  );
  return found ? { artwork: radioArtworkUrl(found.artworkUrl100), storeUrl: radioArtworkUrl(found.trackViewUrl) } : null;
}

export function exactNamedReleaseArtwork(results, artist, title) {
  if (!Array.isArray(results)) return null;
  const wantedArtist = normalizeRecording(artist);
  const wantedTitle = normalizeRecording(title);
  if (!wantedArtist || !wantedTitle) return null;
  // A track may be released on a single/EP sharing its exact name, even if the
  // song itself hasn't yet been indexed by the selected iTunes storefront.
  const validTitles = new Set([wantedTitle, wantedTitle + ' ep', wantedTitle + ' single']);
  const release = results.find(row =>
    row && row.wrapperType === 'collection' &&
    normalizeRecording(row.artistName) === wantedArtist &&
    validTitles.has(normalizeRecording(row.collectionName)) &&
    radioArtworkUrl(row.artworkUrl100) &&
    radioArtworkUrl(row.collectionViewUrl)
  );
  return release
    ? { artwork: radioArtworkUrl(release.artworkUrl100), storeUrl: radioArtworkUrl(release.collectionViewUrl) }
    : null;
}

export async function findNovaCatalogueArtwork(artist, title, fetcher = fetch) {
  const key = normalizeRecording(artist) + '|' + normalizeRecording(title);
  if (key.length < 4 || key.length > 250 || key.startsWith('|') || key.endsWith('|')) return null;
  const cached = entries.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  const lookup = (async () => {
    for (const country of ['FR', 'US']) {
      const url = new URL('https://itunes.apple.com/search');
      url.search = new URLSearchParams({
        country, media:'music', entity:'song', limit:'15',
        term:artist + ' ' + title,
      }).toString();
      const response = await fetcher(url.href);
      if (!response.ok) continue;
      const body = await response.json();
      const verified = exactCatalogueArtwork(body?.results, artist, title);
      if (verified) return verified;
    }
    // Secondary option: the exact same artist's identically titled EP/single.
    // Do not fall back to another album merely by the same artist.
    for (const country of ['FR', 'US']) {
      const url = new URL('https://itunes.apple.com/search');
      url.search = new URLSearchParams({
        country, media:'music', entity:'album', limit:'15',
        term:artist + ' ' + title,
      }).toString();
      const response = await fetcher(url.href);
      if (!response.ok) continue;
      const body = await response.json();
      const verified = exactNamedReleaseArtwork(body?.results, artist, title);
      if (verified) return verified;
    }
    return null;
  })().catch(() => null);
  entries.set(key, { value: lookup, expiresAt: Date.now() + TTL_MS });
  return lookup;
}
