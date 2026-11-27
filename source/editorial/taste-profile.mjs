export const tasteProfileKey = 'off-frequency.taste-profile.v1';

/**
 * @typedef {{url: string, name?: string, kind: 'playlist' | 'curator'}} SpotifyPreference
 * @typedef {'Loved' | 'Interesting' | 'Not for me' | 'Worth revisiting'} Reaction
 * @typedef {{id: string, saved: boolean, reaction?: Reaction, creator?: string, source?: string, genre?: string, mood?: string}} Feedback
 * @typedef {{artists: {artist:string, score:number}[], excluded_artists:string[], known_artist_names:string[]}} WeightedTaste
 * @typedef {{
 *   version: 1, weightedProfile?: WeightedTaste, favoriteArtists: string[], explore: string[], avoid: string[],
 *   favoriteRadios: string[], favoritePublications: string[], spotify: SpotifyPreference[],
 *   signals: {curators: string[], items: Feedback[]},
 * }} TasteProfile
 */

/** @returns {TasteProfile} */
export function emptyTasteProfile() {
  return {
    version: 1, favoriteArtists: [], explore: [], avoid: [], favoriteRadios: [],
    favoritePublications: [], spotify: [], signals: { curators: [], items: [] },
  };
}

const textFields = /** @type {const} */ (['favoriteArtists', 'explore', 'avoid', 'favoriteRadios', 'favoritePublications']);
const feedbackFields = /** @type {const} */ (['creator', 'source', 'genre', 'mood']);
const reactions = ['Loved', 'Interesting', 'Not for me', 'Worth revisiting'];

/** @param {unknown} value @returns {value is Record<string, unknown>} */
function record(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** @param {unknown} value */
function label(value) {
  if (typeof value !== 'string' || value.length > 160 || /[\r\n\t]/.test(value)) {
    throw new Error('Chaque nom ou préférence doit tenir sur une ligne de 160 caractères maximum.');
  }
  return value.trim().normalize('NFC');
}

/** @param {unknown} values */
function labels(values) {
  if (!Array.isArray(values) || values.length > 100) throw new Error('Chaque liste accepte jusqu’à 100 entrées.');
  const seen = new Set();
  return values.map(label).filter(value => {
    const key = value.toLowerCase();
    if (!value || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** @param {unknown} input @returns {SpotifyPreference} */
function spotifyPreference(input) {
  if (record(input) && typeof input.url === 'string') {
    const name = input.name === undefined ? '' : label(input.name);
    try {
      const url = new URL(input.url);
      const path = url.pathname.replace(/^\/intl-[a-z]+\//, '/').replace(/\/$/, '');
      if (url.origin === 'https://open.spotify.com' && !url.username && !url.password) {
        if (/^\/playlist\/[a-zA-Z0-9]{22}$/.test(path)) return { kind: 'playlist', url: url.origin + path, ...(name && { name }) };
        if (/^\/user\/[a-zA-Z0-9._-]+$/.test(path)) return { kind: 'curator', url: url.origin + path, ...(name && { name }) };
      }
    } catch { /* The form displays the allowed link types below. */ }
  }
  throw new Error('Utilise un lien Spotify de playlist ou de profil de curateur (open.spotify.com).');
}

/** @param {unknown} item @returns {Feedback} */
function feedback(item) {
  if (!record(item) || typeof item.id !== 'string' || !item.id.trim() || item.id.length > 1024 || typeof item.saved !== 'boolean'
    || (item.reaction !== undefined && !reactions.includes(/** @type {string} */ (item.reaction)))) {
    throw new Error('Le fichier contient une réaction invalide.');
  }
  const result = /** @type {Feedback} */ ({ id: item.id, saved: item.saved });
  if (item.reaction) result.reaction = /** @type {Reaction} */ (item.reaction);
  for (const field of feedbackFields) {
    const value = item[field];
    if (typeof value === 'string' && value.trim()) result[field] = value.trim().slice(0, 160).replace(/[\r\n\t]+/g, ' ');
  }
  return result;
}

/** Validate and minimize a derived listening profile. No history, timestamps or track data.
 * @param {unknown} input @returns {WeightedTaste}
 */
export function normalizeWeightedTaste(input){
  if(!record(input)||!Array.isArray(input.artists)||input.artists.length>200||
     !Array.isArray(input.excluded_artists)||input.excluded_artists.length>100||
     !Array.isArray(input.known_artist_names)||input.known_artist_names.length>2000)
    throw new Error('Profil musical pondéré invalide.');
  const weights=new Map();
  for(const row of input.artists){
    if(!record(row)||typeof row.score!=='number'||!Number.isFinite(row.score)||row.score<0||row.score>100)throw new Error('Score musical invalide.');
    const artist=label(row.artist), key=artist.toLowerCase();
    if(artist&&(!weights.has(key)||weights.get(key).score<row.score))weights.set(key,{artist,score:row.score});
  }
  const names=/** @param {unknown[]} rows */ rows=>[...new Set(rows.map(label).filter(Boolean))];
  return {artists:[...weights.values()],excluded_artists:names(input.excluded_artists),known_artist_names:names(input.known_artist_names)};
}

/** @param {unknown} value @returns {TasteProfile} */
export function normalizeTasteProfile(value) {
  if (!record(value) || value.version !== 1) throw new Error('Version de profil inconnue.');
  const result = emptyTasteProfile();
  if(value.weightedProfile!==undefined)result.weightedProfile=normalizeWeightedTaste(value.weightedProfile);
  for (const field of textFields) result[field] = labels(value[field]);
  if (!Array.isArray(value.spotify) || value.spotify.length > 100) throw new Error('La liste des liens Spotify est invalide.');
  const spotify = new Map();
  for (const input of value.spotify) {
    const item = spotifyPreference(input);
    if (!spotify.has(item.url)) spotify.set(item.url, item);
  }
  result.spotify = [...spotify.values()];
  const signals = value.signals;
  if (!record(signals) || !Array.isArray(signals.items)) throw new Error('Les signaux de collection sont invalides.');
  result.signals.curators = labels(signals.curators);
  result.signals.items = [...new Map(signals.items.map(item => {
    const entry = feedback(item);
    return [entry.id, entry];
  })).values()].filter(item => item.saved || item.reaction);
  return result;
}

/** @param {string} json */
export function parseTasteProfile(json) {
  return normalizeTasteProfile(JSON.parse(json));
}

/** @param {string} lines */
export function spotifyPreferencesFromText(lines) {
  return lines.split(/\r?\n/).map(line => line.trim()).filter(Boolean).map(line => {
    const separator = line.indexOf('|');
    return separator < 0 ? { url: line } : { name: line.slice(0, separator), url: line.slice(separator + 1).trim() };
  });
}

/**
 * @param {TasteProfile} profile
 * @param {{ entries: Record<string, {saved?: boolean, reaction?: Reaction}>, curators: string[] }} library
 * @param {{id: string, creator?: string, source?: string, genre?: string, mood?: string}[]} recommendations
 * @param {boolean} includeSignals
 */
export function tasteProfileForExport(profile, library, recommendations, includeSignals) {
  if (!includeSignals) return { ...profile, signals: emptyTasteProfile().signals };
  const byId = new Map(recommendations.map(item => [item.id, item]));
  const items = new Map(profile.signals.items.map(item => [item.id, item]));
  for (const [id, entry] of Object.entries(library.entries)) {
    if (!entry.saved && !entry.reaction) {
      items.delete(id);
      continue;
    }
    const item = byId.get(id);
    items.set(id, feedback({ ...items.get(id), ...item, id, saved: entry.saved === true, reaction: entry.reaction }));
  }
  return normalizeTasteProfile({
    ...profile,
    signals: { curators: [...new Set([...profile.signals.curators, ...library.curators])].slice(0, 100), items: [...items.values()] },
  });
}
