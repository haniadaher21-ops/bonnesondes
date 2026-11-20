// Only show artwork supplied by the broadcaster's currently-playing metadata.
// A missing image is better than an unrelated or guessed album cover.
export function radioArtworkUrl(value) {
  if (typeof value !== 'string' || value.length > 2048) return undefined;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || !url.hostname || url.username || url.password) return undefined;
    return url.href;
  } catch {
    return undefined;
  }
}
