import { canonicalUrl, editionItems, isoDate, parisDate, sourceUrl, validateEdition } from '../editorial/edition.mjs';
import { buildArtistAffinity, mixTracklistAffinity, verifiedTracklistArtists } from './tracklist-affinity.mjs';
import { spotifyPlaylistId } from './discovery-feeds.mjs';
import { normalized } from './weekly-evidence.mjs';
import { excludesJazz, excludesElectronicMix, editorialEndorsement, isFreshMusicMix, isNovaMix, isNtsMix, isYouTubeMix, isFipTape, MIN_YOUTUBE_MIX_VIEWS } from './recommendation-policy.mjs';

import {makeWeightedAffinity, weightedAffinity} from './weighted-affinity.mjs';
import {editorialWorkScore} from './editorial-work-score.mjs';

// Never treat a curator, channel or DJ as a recording artist.
export function candidateArtistCredits(item,now){
  if(['Album','Live session'].includes(item.format))return [item.creator,...(item.artistCredits??[])].filter(x=>typeof x==='string'&&x.trim());
  if(item.format==='Radio show')return verifiedTracklistArtists(item,now);
  return []; // no verified playlist track evidence yet
}
const DAY = 86400000;
const addDays = (date, days) => new Date(Date.parse(date) + days * DAY).toISOString().slice(0, 10);
const groups = [
  { name: 'albums', count: 3, max: 3, match: item => item.format === 'Album' },
  { name: 'nts', count: 1, max: 1, match: isNtsMix },
  { name: 'nova', count: 1, max: 1, match: isNovaMix },
  { name: 'youtube', count: 1, max: 1, match: isYouTubeMix },
  { name: 'fip', count: 0, max: 1, match: isFipTape },
  { name: 'playlists', count: 1, max: 1, match: item => item.format === 'Playlist' },
  { name: 'live', count: 3, max: 3, match: item => item.format === 'Live session' },
];

export function nextEditionMonday(now) {
  const date = parisDate(now);
  const weekday = new Date(date + 'T00:00:00Z').getUTCDay();
  return addDays(date, ((7 - weekday) % 7) + 1);
}

const matchingValue = (needles, fields) => needles.find(needle => {
  const key = normalized(needle);
  if (!key) return false;
  return fields.some(field => {
    const value = normalized(field);
    // The owner may write "KEXP", "NTS", "Brownswood" or "Nova" while
    // collected programmes carry fuller names. Match complete word sequences,
    // never arbitrary partial words ("art" must not match "artist").
    return value === key || (key.length >= 3 && (' ' + value + ' ').includes(' ' + key + ' '));
  });
});
const feedbackWeight = { Loved: 24, Interesting: 10, 'Worth revisiting': 12, 'Not for me': -40 };

function rank(item, profile, today, tasteWeight, previouslySeen, artistIndex, tracklistWeight, now, weightedMode=false) {
  const signals = [];
  let affinity = 0;
  function signal(value, points, reason) {
    if (!value) return;
    affinity += points;
    signals.push(reason);
  }
  const artist = matchingValue(profile.favoriteArtists, [item.creator,...(item.artistCredits ?? [])]);
  const preferences = [...profile.favoriteRadios,...profile.favoritePublications,...profile.spotify.map(entry=>entry.name).filter(Boolean)];
  const source = matchingValue(preferences, [item.source,item.provider,item.publisher,item.discoverySource]);
  const curatedSource = item.format==='Album' && matchingValue(preferences,[item.editorialSource]);
  const endorsement = item.format==='Album' && editorialEndorsement(item);
  const attributes = [item.genre, item.mood, ...(item.tags ?? [])];
  signal(artist, item.format==='Live session'?72:38, 'Artiste parmi tes favoris');
  signal(source, item.format === 'Album' ? 8 : item.format==='Live session'?24:32, 'Source parmi tes préférées');
  signal(curatedSource, 65, 'Média ou curateur recommandé dans ton profil');
  signal(endorsement, endorsement?.kind==='critic-pick'?82:68, 'Véritable sélection éditoriale vérifiée');
  const editorialAge=isoDate(item.editorialPublishedAt)
    ? (Date.parse(today)-Date.parse(item.editorialPublishedAt))/DAY : undefined;
  signal(endorsement && editorialAge>=0 && editorialAge<=30,
    Math.max(0, 18-Math.floor(editorialAge/2)), 'Sélection de presse publiée dans le dernier mois');
  signal(matchingValue(profile.explore, attributes), item.format==='Live session'?60:28, 'Genre ou ambiance à explorer');
  signal(matchingValue(profile.avoid, attributes), item.format==='Live session'?-110:-65, 'Genre ou ambiance que tu préfères éviter');
  const followsPlaylist = profile.spotify.some(entry => entry.kind === 'playlist' && canonicalUrl(entry.url) === canonicalUrl(item.url));
  signal(followsPlaylist, 24, 'Playlist suivie dans ton profil');
  signal(item.format === 'Playlist' && matchingValue([...profile.signals.curators,...profile.spotify.filter(entry=>entry.kind==='curator').map(entry=>entry.name).filter(Boolean)], [item.creator]), 28, 'Curateur parmi tes favoris');
  const feedback = profile.signals.items.find(entry => entry.id === item.id);
  signal(feedback?.saved, 12, 'Déjà enregistré dans Ma collection');
  signal(feedback?.reaction, feedbackWeight[feedback?.reaction] ?? 0, feedback?.reaction ? 'Réaction dans Bonnes Ondes « ' + ({
    Loved: 'Coup de cœur', Interesting: 'Intéressant', 'Worth revisiting': 'À réécouter', 'Not for me': 'Pas pour moi',
  })[feedback.reaction] + ' »' : '');

  // Apply reactions to genuinely related future discoveries, never to an unrelated
  // artist merely because a video came from the same radio or YouTube channel.
  const priorReactions = profile.signals.items.filter(entry =>
    entry.id !== item.id && (entry.reaction === 'Loved' || entry.reaction === 'Not for me'));
  const reactionBalance = entries => entries.reduce((total, entry) =>
    total + (entry.reaction === 'Loved' ? 1 : -1), 0);
  const artistMatches = priorReactions.filter(entry =>
    normalized(entry.creator) && normalized(entry.creator) === normalized(item.creator));
  const artistBalance = reactionBalance(artistMatches);
  signal(artistBalance > 0, 20, 'Autre contenu d’un artiste déjà apprécié');
  signal(artistBalance < 0, -28, 'Autre contenu d’un artiste déjà écarté');
  const styleMatches = priorReactions.filter(entry =>
    (normalized(entry.genre) && normalized(entry.genre) === normalized(item.genre))
    || (normalized(entry.mood) && normalized(entry.mood) === normalized(item.mood)));
  const styleBalance = reactionBalance(styleMatches);
  signal(styleBalance > 0, 7, 'Genre ou ambiance déjà apprécié');
  signal(styleBalance < 0, -12, 'Genre ou ambiance déjà écarté');

  const tracklistAffinity = mixTracklistAffinity(item, artistIndex, now);
  signal(tracklistAffinity.points && tracklistWeight, tracklistAffinity.points * tracklistWeight, 'Affinité des artistes dans la tracklist vérifiée');
  const date = item.releaseDate ?? item.date;
  const age = isoDate(date) ? (Date.parse(today) - Date.parse(date)) / DAY : undefined;
  // A new album must be current, not a years-old review that ranks on reputation alone.
  const freshness = item.format === 'Album' && age >= 0 ? Math.max(0, 36 - 2 * age)
    : item.format === 'Live session' ? 0
    : item.mixKind==='curated-mix' && age>=0 ? age<=30?26:age<=90?20:age<=180?12:3
    : age>=0 ? Math.max(0,28-age) : 0;
  const novelty = item.playlistOrigin === 'publisher-discovered' ? (previouslySeen ? 16 : 32) : 0;
  // For YouTube, prefer a demonstrable selector/DJ and vinyl-oriented sets
  // over generic compilations. This is title/channel evidence, not audio analysis.
  const videoMix = item.mixKind === 'curated-mix';
  const genuineSelector = /\bDJ\s+(?!set\b|mix\b|session\b)[\p{L}\p{N}]/iu.test(item.title??'')
    || /^DJ\s+[\p{L}\p{N}]/iu.test(item.creator??'');
  const vinylSelection = /\ball[\s-]?vinyl\b/i.test(item.title??'');
  const trustedSession = /\b(?:Kiosk Radio|Boiler Room|HÖR Berlin|The Lot Radio|My Analog Journal)\b/i
    .test([item.source,item.title].join(' '));
  const genericCompilation = /\bbest\s+(?:vintage|soul|funk|old school).*\bmix\b/i.test(item.title??'');
  const genreStrength = weightedMode ? {rnb:104,soul:102,blues:100,pop:100,'light-house':98,funk:96}
    : {rnb:135,soul:125,blues:112,pop:96,'light-house':90,funk:65};
  const mixQuality = videoMix ? (genreStrength[item.mixStyle]??0)
    + 20*Number(genuineSelector) + 12*Number(vinylSelection)
    + 5*Number(/\bvinyl\b/i.test(item.title??''))
    + 18*Number(trustedSession) - 30*Number(genericCompilation)
    + Math.min(30,Math.round(10*Math.log10(Math.max(1,item.viewCount??1)/MIN_YOUTUBE_MIX_VIEWS))) : 0;
  const quality = 18 + (item.creator ? 5 : 0) + (item.tracklistUrl ? 4 : 0) + mixQuality;
  const baseline = freshness + novelty + quality;
  const score = Math.round((baseline + affinity * tasteWeight) * 100) / 100;

  const evidence = {
    Album: endorsement ? 'Sélection « ' + endorsement.claim + ' » de ' + (endorsement.source??'un média musical')
      + ', sortie originale vérifiée (' + date + ')' : 'Aucune recommandation éditoriale attestée',
    'Radio show': item.mixKind==='curated-mix'
      ? 'Mix '+({rnb:'R&B',soul:'soul',blues:'blues',pop:'pop','light-house':'house douce',funk:'funk'}[item.mixStyle]??'musical')
        +' mis en ligne le '+date+' sur '+(item.provider??item.source)
        +' ; '+Number(item.viewCount??0).toLocaleString('fr-FR')+' vues vérifiées'
      : isFipTape(item) ? 'Voyage musical thématique publié le '+date+' par FIP'
      : 'DJ set musical diffusé le '+date+' sur '+(item.provider??item.source),
    Playlist: item.playlistOrigin === 'publisher-discovered' ? 'Lien vérifié et publié par ' + (item.creator ?? item.provider ?? 'le média source') : 'Playlist vérifiée sur Spotify',
    'Live session': 'Performance publiée par une chaîne officielle, vidéo intégrable de ' + Math.round(item.minutes * 60) + ' secondes',
  }[item.format];
  return { item, score, publicReason: evidence + '.', reason: [evidence, ...signals].join('. ') + '.', signals, age, tracklistAffinity };
}

function exclusion(item, today, startsOn) {
  if (!item.id || !item.title || !item.source || !sourceUrl(item.url) || !sourceUrl(item.sourceUrl)) return 'Lien ou provenance manquante';
  if (excludesJazz(item)) return 'Jazz exclu des recommandations';
  if (item.format==='Radio show' && (item.mixKind==='curated-mix' || isFipTape(item)) && excludesElectronicMix(item))
    return 'Mix électro exclu par les préférences';
  if (item.format === 'Album') {
    if (!editorialEndorsement(item)) return 'Aucune recommandation éditoriale vérifiée';
    if (!['primary-verified', 'editor-verified'].includes(item.verificationStatus) || !isoDate(item.releaseDate)) return 'Date originale non vérifiée';
    if (item.releaseDate > today) return 'Sortie encore à venir';
    const earliest = addDays(startsOn, -14);
    if (item.releaseDate < earliest) return 'Album hors de la fenêtre des 14 derniers jours';
  }
  if (item.format === 'Live session' && !normalized(item.creator)) return 'Artiste de la performance non identifié';
  if (item.format === 'Radio show' && !['source-verified', 'editor-verified'].includes(item.verificationStatus)) return 'Replay individuel à vérifier';
  if (item.format === 'Radio show' && item.mixKind==='curated-mix' && !isYouTubeMix(item))
    return 'Mix YouTube exclu : moins de 100 000 vues ou style R&B/soul/blues/pop/house douce non vérifié';
  if (item.format === 'Radio show' && !isFreshMusicMix(item,startsOn,today)) return 'Pas un DJ mix musical de la semaine précédente';
  if (item.format === 'Playlist' && (!spotifyPlaylistId(item.url) || item.verificationStatus !== 'source-verified' || !item.creator)) return 'Lien ou curateur non vérifié';
  if (item.format === 'Live session' && item.verificationStatus !== 'performance-verified') return 'Durée ou caractère officiel de la session à vérifier';
  if (isoDate(item.date) && item.date > today) return 'Publication encore à venir';
}

export function weeklyShortlist({ candidates, sources = [], profile, earlier, catalog, startsOn, now = new Date(), tasteWeight = 0.7, tracklistWeight = 1, seen = {}, weightedProfile, artistMetadata = new Map(), weightedWeight = 0 }) {
  if (!isoDate(startsOn) || !Number.isFinite(tasteWeight) || tasteWeight < 0 || tasteWeight > 1 || !Number.isFinite(tracklistWeight) || tracklistWeight < 0 || tracklistWeight > 1) throw new Error('Date ou poids de profil invalide.');
  if(!Number.isFinite(weightedWeight)||weightedWeight<0||weightedWeight>1)throw new Error('Poids affinitaire invalide.');
  const weightedIndex=weightedProfile&&weightedWeight>0?makeWeightedAffinity(weightedProfile):null;
  const today = parisDate(now);
  const albumWindowStart = addDays(startsOn, -14);
  const known = [...catalog, ...earlier.flatMap(editionItems)];
  const artistIndex = buildArtistAffinity(profile, known);
  const knownIds = new Set(known.map(item => item.id));
  const knownUrls = new Set(known.map(item => canonicalUrl(item.url)));
  const rejected = [];
  const rankings = [];
  for (const item of candidates) {
    let why = exclusion(item, today, startsOn);
    if (knownIds.has(item.id) || knownUrls.has(canonicalUrl(item.url))) why = 'Déjà au catalogue';
    if (why) {
      rejected.push({ id: item.id, title: item.title, format: item.format, url: item.url, reason: why });
      continue;
    }
    const previouslySeen = Object.hasOwn(seen, canonicalUrl(item.url));
    const row={...rank(item, profile, today, tasteWeight, previouslySeen, artistIndex, tracklistWeight, now, Boolean(weightedIndex?.weights.size)), previouslySeen};
    if(weightedIndex){
      const match=weightedAffinity(candidateArtistCredits(item,now),weightedIndex,artistMetadata,{tracklist:item.format==='Radio show'});
      if(match.excluded){
        rejected.push({id:item.id,title:item.title,format:item.format,url:item.url,reason:'Exclusion du profil privé'});
        continue;
      }
      row.weightedAffinity=match;
      row.score=Math.round((row.score+match.points*weightedWeight)*100)/100;
      if(['Album','Live session','Radio show'].includes(item.format)&&weightedProfile.style_preferences?.length){
        const knownArtist=candidateArtistCredits(item,now).some(name=>weightedIndex.known.has(name.normalize('NFKC').toLowerCase().trim().replace(/\s+/gu,' ')));
        row.editorialWork=editorialWorkScore(item,{styles:weightedProfile.style_preferences,affinity:match,known:knownArtist,now,credits:candidateArtistCredits(item,now),metadata:artistMetadata,knownArtists:weightedIndex.known,tracklistVerified:row.tracklistAffinity?.available===true});
        // Explicit negative feedback and avoidance remain effective; the new
        // editorial score must not quietly override the user's manual choices.
        const feedback=profile.signals.items.find(entry=>entry.id===item.id);
        const avoid=matchingValue(profile.avoid,[item.genre,item.mood,...(item.tags??[])]);
        const adjustment=(feedback?.reaction==='Not for me'?-40:feedback?.reaction==='Loved'?12:0)-(avoid?35:0);
        const workPoints=row.editorialWork.points+adjustment;
        row.score=Math.round((row.score*(1-weightedWeight)+workPoints*weightedWeight)*100)/100;
      }
      // Do not write private scores or artist matches into item/reason/publicReason.
    }
    rankings.push(row);
  }
  rankings.sort((a, b) => b.score - a.score || a.item.id.localeCompare(b.item.id));
  const selected = {};
  const ids = new Set();
  const urls = new Set();
  const artists = new Set();
  const performances = new Set();
  const providers = new Map();
  const usedMixPrograms = new Set();
  for (const group of groups) {
    const options = rankings.filter(entry => group.match(entry.item));
    const chosen = [];
    const localProviders = new Set();
    while (chosen.length < group.max) {
      const provider = ({ item }) => item.format === 'Live session'
        ? (item.sourceId ?? item.source) : (item.provider ?? item.source);
      const remaining = options.filter(entry => {
        const { item } = entry;
        // For live discoveries, each pick must use a different format/studio.
        // For DJ sets, two episodes from the same series aren't diverse enough.
        if (group.name==='live' && localProviders.has(provider(entry))) return false;
        if (['nts','nova','youtube'].includes(group.name) && item.sourceId && usedMixPrograms.has(item.sourceId)) return false;
        if (chosen.length >= group.count && localProviders.has(provider(entry))) return false;
        const key = canonicalUrl(item.url);
        const artist = normalized(item.creator);
        const performance = item.format === 'Live session' && normalized(item.title);
        return !ids.has(item.id) && !urls.has(key) && !(artist && item.format !== 'Playlist' && artists.has(artist))
          && !(performance && performances.has(performance));
      });
      const adjusted = entry => entry.score
        - (group.name === 'albums' ? 38 : 18) * Number(localProviders.has(provider(entry)))
        - 6 * (providers.get(provider(entry)) ?? 0);
      remaining.sort((a,b)=>adjusted(b)-adjusted(a));
      const entry = remaining[0];
      if (!entry) break;
      const { item } = entry;
      chosen.push(entry);
      ids.add(item.id);
      urls.add(canonicalUrl(item.url));
      if (item.creator && item.format !== 'Playlist') artists.add(normalized(item.creator));
      if (item.format === 'Live session') performances.add(normalized(item.title));
      if (item.format === 'Radio show' && item.sourceId) usedMixPrograms.add(item.sourceId);
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
    mixPolicy:'nts-nova-youtube-v1',
    albums: picks('albums'), mixes: [...picks('nts'), ...picks('nova'), ...picks('youtube'), ...picks('fip')], playlists: picks('playlists'), live: picks('live'),
  };
  const gaps = Object.fromEntries(groups.filter(group => selected[group.name].length < group.count)
    .map(group => [group.name, group.count - selected[group.name].length]));
  const errors = validateEdition(draft, earlier, catalog);
  const personalized = [profile.favoriteArtists, profile.favoriteRadios, profile.favoritePublications, profile.spotify,
    profile.explore, profile.avoid, profile.signals.items, profile.signals.curators].some(group => group.length > 0) && tasteWeight > 0 || Boolean(weightedIndex && weightedIndex.weights.size);
  return { generatedAt: now.toISOString(), personalized, tasteWeight, complete: errors.length === 0, draft,
    selected, rankings, gaps, errors, rejected, sources };
}
