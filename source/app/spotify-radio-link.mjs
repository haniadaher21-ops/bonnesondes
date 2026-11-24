// Search Spotify for a broadcaster-identified song. No fabricated Spotify
// track ID: a search is deliberately used until an exact match is verified.
export function spotifyRadioSearchUrl(title, artist) {
  if (typeof title !== 'string' || typeof artist !== 'string') return null;
  const song = title.trim().replace(/\s+/g, ' ');
  const performer = artist.trim().replace(/\s+/g, ' ');
  if (!song || !performer) return null;
  return 'https://open.spotify.com/search/' + encodeURIComponent(performer + ' ' + song);
}
