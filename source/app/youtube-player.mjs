// A single YouTube iframe stays mounted while Bonnes Ondes' hash-routed
// sections change. An iframe inside a card would be destroyed at navigation.
export const playableYouTubeId = value => typeof value === 'string' && /^[A-Za-z0-9_-]{11}$/.test(value);

export function youtubeEmbedSrc(id) {
  if (!playableYouTubeId(id)) return;
  // The iframe is only rendered after a user clicks "Lire"; do not load or
  // autoplay videos on page load. youtube.com receives a page referrer.
  return 'https://www.youtube.com/embed/' + id + '?autoplay=1&playsinline=1&rel=0';
}
