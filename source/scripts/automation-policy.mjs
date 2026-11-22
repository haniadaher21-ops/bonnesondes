import { canonicalUrl, isoDate, parisDate, sourceUrl, validateEdition } from '../editorial/edition.mjs';
import { normalized } from './weekly-evidence.mjs';
import { isFreshMusicMix } from './recommendation-policy.mjs';

const DAY = 86400000;
const publicFields = ['id','title','creator','format','source','publisher','url','sourceUrl','artwork','date','minutes',
  'mood','season','genre','embed','officialVideo','videoSourceUrl','mixKind','sourceId',
  'editorialSource','editorialUrl','editorialClaim'];

export function editionForCycle(at) {
  const date = parisDate(at);
  const weekday = new Date(date + 'T12:00:00Z').getUTCDay();
  // A delayed run on Monday continues the preceding Sunday's cycle.
  const delta = weekday === 0 ? 1 : weekday === 1 ? 0 : 8 - weekday;
  return new Date(Date.parse(date) + delta * DAY).toISOString().slice(0,10);
}

export function publicationDecision({at, startsOn, editions, complete, enabled, observations = [], fingerprint}) {
  const date = parisDate(at);
  if (editions.some(edition => edition.startsOn === startsOn)) return {status:'noop', reason:'Édition déjà enregistrée'};
  if (!complete) return {status:'blocked',reason:'Preuves ou quotas insuffisants'};
  if (enabled !== 'true') return {status:'observe',reason:'Publication désactivée'};
  const hour = Number(new Intl.DateTimeFormat('en-GB', {timeZone:'Europe/Paris',hour:'2-digit',hourCycle:'h23'}).format(at));
  const target = editionForCycle(at);
  const sameCycle = startsOn === target && (date === startsOn || (new Date(date + 'T12:00:00Z').getUTCDay() === 0 && hour >= 18));
  if (!sameCycle) return {status:'blocked',reason:'Hors du cycle dimanche 18 h – lundi'};
  const recent = observations.filter(run => run.complete === true && run.fingerprint === fingerprint
    && Date.parse(run.at) >= at.getTime() - 14*DAY && Date.parse(run.at) <= at.getTime());
  const successful = new Set(recent.map(run => run.id));
  if (successful.size < 2) return {status:'blocked',reason:'Deux observations complètes sont requises'};
  // Multiple checks in a single workflow do not prove reliability over time.
  // Two distinct scheduled weekly editions must have passed with unchanged config/profile.
  const scheduledWeeks = new Set(recent.filter(run => run.trigger === 'schedule')
    .map(run => editionForCycle(new Date(run.at))));
  if (scheduledWeeks.size < 2) return {status:'blocked',reason:'Deux semaines de brouillons planifiés réussis sont requises'};
  return {status:'publish',reason:'Contrôles satisfaits'};
}

export function rollCandidates(previous, fresh, now) {
  const rows = new Map();
  for (const item of [...previous,...fresh]) {
    const key = canonicalUrl(item.url);
    if (!key || !item.id || !item.sourceUrl || !item.collectedAt) continue;
    const age = now.getTime() - Date.parse(item.collectedAt);
    // YouTube verification is refreshed separately and metadata expires within 30 days.
    if (!Number.isFinite(age) || age < 0 || age > (item.format === 'Live session' ? 28 : 60)*DAY
      || item.playlistOrigin === 'followed') continue;
    const older = rows.get(key);
    if (older && (older.id !== item.id || older.format !== item.format)) continue;
    rows.set(key,{...(older??{}),...item,firstSeenAt:older?.firstSeenAt ?? item.firstSeenAt ?? item.collectedAt});
  }
  return [...rows.values()].slice(-1500);
}

export function publicEdition(report, earlier, catalog) {
  if (!report.complete) throw new Error('Brouillon incomplet.');
  const draft = {...report.draft};
  const artists = new Set();
  for (const section of ['albums','mixes','playlists','live']) {
    draft[section] = report.draft[section].map(item => {
      const entry = Object.values(report.selected).flat().find(row => row.item.id === item.id);
      if (!entry?.publicReason) throw new Error('Justification publique absente.');
      const clean = Object.fromEntries(publicFields.filter(field => item[field] !== undefined).map(field => [field,item[field]]));
      clean.reason = entry.publicReason;
      if (!sourceUrl(clean.url) || !sourceUrl(clean.sourceUrl)) throw new Error('Liens invalides.');
      const artist = normalized(clean.creator);
      if (artist && clean.format !== 'Playlist') {
        if (artists.has(artist)) throw new Error('Artiste répété.');
        artists.add(artist);
      }
      if (section === 'mixes' && !isFreshMusicMix(item,draft.startsOn,draft.startsOn))
        throw new Error('Le mix n’est pas un DJ set musical de la semaine précédente.');
      if (section === 'albums' && (!isoDate(item.releaseDate) || item.verificationStatus !== 'primary-verified')) throw new Error('Album non vérifié.');
      if (section === 'live' && item.verificationStatus !== 'performance-verified') throw new Error('Performance non vérifiée.');
      return clean;
    });
  }
  const errors = validateEdition(draft,earlier,catalog);
  if (errors.length) throw new Error('Schéma éditorial invalide.');
  return draft;
}
