import { canonicalUrl, editionItems, isoDate, parisDate, sourceUrl, validateEdition } from '../editorial/edition.mjs';
import { spotifyPlaylistId } from './discovery-feeds.mjs';
import { normalized } from './weekly-evidence.mjs';

const DAY = 86400000;
const addDays = (date, days) => new Date(Date.parse(date) + days * DAY).toISOString().slice(0, 10);
const radioNts = item => /^https:\/\/(?:www\.)?nts\.live\/shows\/[^/]+\/episodes\/[^/]+$/.test(canonicalUrl(item.url));
const groups = [
  { name: 'albums', count: 3, max: 3, match: item => item.format === 'Album' },
  { name: 'nts', count: 1, max: 1, match: item => item.format === 'Radio show' && radioNts(item) },
  { name: 'otherRadio', count: 1, max: 1, match: item => item.format === 'Radio show' && !radioNts(item) },
  { name: 'playlists', count: 1, max: 1, match: item => item.format === 'Playlist' },
  { name: 'live', count: 1, max: 2, match: item => item.format === 'Live session' },
];

export function nextEditionMonday(now) {
  const date = parisDate(now);
  const weekday = new Date(date + 'T00:00:00Z').getUTCDay();
  return addDays(date, ((7 - weekday) % 7) + 1);
}

const matchingValue = (needles, fields) => needles.find(needle =>
  normalized(needle) && fields.some(field => normalized(needle) === normalized(field)));
const feedbackWeight = { Loved: 24, Interesting: 10, 'Worth revisiting': 12, 'Not for me': -40 };

function rank(item, profile, today, tasteWeight, previouslySeen) {
  const signals = [];
  let affinity = 0;
  function signal(value, points, reason) {
    if (!value) return;
    affinity += points;
    signals.push(reason);
  }
  const artist = matchingValue(profile.favoriteArtists, [item.creator,...(item.artistCredits ?? [])]);
  const source = matchingValue([...profile.favoriteRadios, ...profile.favoritePublications], [item.source, item.provider, item.publisher, item.discoverySource]);
  const attributes = [item.genre, item.mood, ...(item.tags ?? [])];
  signal(artist, 38, 'Artiste parmi tes favoris');
  signal(source, 32, 'Source parmi tes préférées');
  signal(matchingValue(profile.explore, attributes), 22, 'Genre ou ambiance à explorer');
  signal(matchingValue(profile.avoid, attributes), -40, 'Genre ou ambiance que tu préfères éviter');
  const followsPlaylist = profile.spotify.some(entry => entry.kind === 'playlist' && canonicalUrl(entry.url) === canonicalUrl(item.url));
  signal(followsPlaylist, 24, 'Playlist suivie dans ton profil');
  signal(item.format === 'Playlist' && matchingValue(profile.signals.curators, [item.creator]), 28, 'Curateur parmi tes favoris');
  const feedback = profile.signals.items.find(entry => entry.id === item.id);
  signal(feedback?.saved, 12, 'Déjà enregistré dans Ma collection');
  signal(feedback?.reaction, feedbackWeight[feedback?.reaction] ?? 0, feedback?.reaction ? 'Réaction dans Bonnes Ondes « ' + ({
    Loved: 'Coup de cœur', Interesting: 'Intéressant', 'Worth revisiting': 'À réécouter', 'Not for me': 'Pas pour moi',
  })[feedback.reaction] + ' »' : '');

  const date = item.releaseDate ?? item.date;
  const age = isoDate(date) ? (Date.parse(today) - Date.parse(date)) / DAY : undefined;
  const freshness = age >= 0 ? Math.max(0, 28 - age) : 0;
  const novelty = item.playlistOrigin === 'publisher-discovered' ? (previouslySeen ? 16 : 32) : 0;
  const quality = 18 + (item.creator ? 5 : 0) + (item.tracklistUrl ? 4 : 0);
  const baseline = freshness + novelty + quality;
  const score = Math.round((baseline + affinity * tasteWeight) * 100) / 100;

  const evidence = {
    Album: 'Date de sortie originale vérifiée auprès de la source primaire (' + date + ')',
    'Radio show': (age > 14 ? 'Replay d’archive' : 'Replay individuel') + (date ? ' du ' + date : '') + ' sur ' + (item.provider ?? item.source),
    Playlist: item.playlistOrigin === 'publisher-discovered' ? 'Lien vérifié et publié par ' + (item.creator ?? item.provider ?? 'le média source') : 'Playlist vérifiée sur Spotify',
    'Live session': 'Performance publiée par une chaîne officielle, vidéo intégrable de ' + Math.round(item.minutes * 60) + ' secondes',
  }[item.format];
  return { item, score, publicReason: evidence + '.', reason: [evidence, ...signals].join('. ') + '.', signals, age };
}

function exclusion(item, windowStart, today) {
  if (!item.id || !item.title || !item.source || !sourceUrl(item.url) || !sourceUrl(item.sourceUrl)) return 'Lien ou provenance manquante';
  if (item.format === 'Album') {
    if (!['primary-verified', 'editor-verified'].includes(item.verificationStatus) || !isoDate(item.releaseDate)) return 'Date originale non vérifiée';
    if (item.releaseDate < windowStart || item.releaseDate > today) return 'Sortie hors fenêtre ou encore à venir';
  }
  if (item.format === 'Radio show' && !['source-verified', 'editor-verified'].includes(item.verificationStatus)) return 'Replay individuel à vérifier';
  if (item.format === 'Playlist' && (!spotifyPlaylistId(item.url) || item.verificationStatus !== 'source-verified' || !item.creator)) return 'Lien ou curateur non vérifié';
  if (item.format === 'Live session' && item.verificationStatus !== 'performance-verified') return 'Durée ou caractère officiel de la session à vérifier';
  if (isoDate(item.date) && item.date > today) return 'Publication encore à venir';
}

export function weeklyShortlist({ candidates, sources = [], profile, earlier, catalog, startsOn, now = new Date(), tasteWeight = 0.7, seen = {} }) {
  if (!isoDate(startsOn) || !Number.isFinite(tasteWeight) || tasteWeight < 0 || tasteWeight > 1) throw new Error('Date ou poids de profil invalide.');
  const today = parisDate(now);
  const albumWindowStart = addDays(startsOn, -14);
  const known = [...catalog, ...earlier.flatMap(editionItems)];
  const knownIds = new Set(known.map(item => item.id));
  const knownUrls = new Set(known.map(item => canonicalUrl(item.url)));
  const rejected = [];
  const rankings = [];
  for (const item of candidates) {
    let why = exclusion(item, albumWindowStart, today);
    if (knownIds.has(item.id) || knownUrls.has(canonicalUrl(item.url))) why = 'Déjà au catalogue';
    if (why) {
      rejected.push({ id: item.id, title: item.title, format: item.format, url: item.url, reason: why });
      continue;
    }
    const previouslySeen = Object.hasOwn(seen, canonicalUrl(item.url));
    rankings.push({ ...rank(item, profile, today, tasteWeight, previouslySeen), previouslySeen });
  }
  rankings.sort((a, b) => b.score - a.score || a.item.id.localeCompare(b.item.id));
  const selected = {};
  const ids = new Set();
  const urls = new Set();
  const artists = new Set();
  const performances = new Set();
  const providers = new Map();
  for (const group of groups) {
    const options = rankings.filter(entry => group.match(entry.item));
    const chosen = [];
    const localProviders = new Set();
    while (chosen.length < group.max) {
      const provider = ({ item }) => item.provider ?? item.source;
      const remaining = options.filter(entry => {
        const { item } = entry;
        if (chosen.length >= group.count && localProviders.has(provider(entry))) return false;
        const key = canonicalUrl(item.url);
        const artist = normalized(item.creator);
        const performance = item.format === 'Live session' && normalized(item.title);
        return !ids.has(item.id) && !urls.has(key) && !(artist && item.format !== 'Playlist' && artists.has(artist))
          && !(performance && performances.has(performance));
      });
      const adjusted = entry => entry.score - 18 * Number(localProviders.has(provider(entry))) - 6 * (providers.get(provider(entry)) ?? 0);
      remaining.sort((a, b) => adjusted(b) - adjusted(a));
      const entry = remaining[0];
      if (!entry) break;
      const { item } = entry;
      chosen.push(entry);
      ids.add(item.id);
      urls.add(canonicalUrl(item.url));
      if (item.creator && item.format !== 'Playlist') artists.add(normalized(item.creator));
      if (item.format === 'Live session') performances.add(normalized(item.title));
      localProviders.add(provider(entry));
      providers.set(provider(entry), (providers.get(provider(entry)) ?? 0) + 1);
    }
    selected[group.name] = chosen;
  }
  const picks = name => selected[name].map(({ item, reason }) => ({
    ...item, ...(item.format === 'Album' && { date: item.releaseDate }), reason,
  }));
  const previous = earlier.at(-1);
  const draft = {
    number: String(Number(previous?.number ?? 1) + 1).padStart(3, '0'),
    startsOn, label: 'semaine du ' + startsOn, albumWindowStart, featuredId: picks('nts')[0]?.id,
    albums: picks('albums'), mixes: [...picks('nts'), ...picks('otherRadio')], playlists: picks('playlists'), live: picks('live'),
  };
  const gaps = Object.fromEntries(groups.filter(group => selected[group.name].length < group.count)
    .map(group => [group.name, group.count - selected[group.name].length]));
  const errors = validateEdition(draft, earlier, catalog);
  const personalized = [profile.favoriteArtists, profile.favoriteRadios, profile.favoritePublications, profile.spotify,
    profile.explore, profile.avoid, profile.signals.items, profile.signals.curators].some(group => group.length > 0) && tasteWeight > 0;
  return { generatedAt: now.toISOString(), personalized, tasteWeight, complete: errors.length === 0, draft,
    selected, rankings, gaps, errors, rejected, sources };
}
