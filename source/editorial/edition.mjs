/** @param {Date} date */
export function parisDate(date) {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Paris' }).format(date);
}

/**
 * @template {{ startsOn: string }} Edition
 * @param {Edition[]} editions
 * @param {Date} [at]
 * @returns {Edition | undefined}
 */
export function selectEdition(editions, at = new Date()) {
  const day = parisDate(at);
  // A manually approved edition may be released the preceding Sunday.
  // Regular editions retain the normal Monday-midnight Europe/Paris rollover.
  return editions.filter(edition => edition.startsOn <= day
    || (isoDate(edition.publishedAt) && edition.publishedAt <= day))
    .sort((a, b) => b.startsOn.localeCompare(a.startsOn))[0];
}

export function isoDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + 'T00:00:00Z');
  return !Number.isNaN(+date) && date.toISOString().slice(0, 10) === value;
}

export function sourceUrl(value) {
  if (typeof value !== 'string') return undefined;
  try {
    const url = new URL(value);
    if (url.protocol === 'https:' && !url.username && !url.password) return url;
  } catch {}
}

const formatByGroup = { albums: 'Album', mixes: 'Radio show', playlists: 'Playlist', live: 'Live session' };
const text = value => typeof value === 'string' && value.trim().length > 0;
const isNts = url => !!url && ['www.nts.live', 'nts.live'].includes(url.hostname)
  && /^\/shows\/[^/]+\/episodes\/[^/]+\/?$/.test(url.pathname);

export function validateEdition(edition, earlier = [], catalog = []) {
  if (!edition || typeof edition !== 'object') return ['Édition manquante.'];
  const errors = [];
  const { number, startsOn, label, albumWindowStart } = edition;
  const previous = earlier.at(-1);
  if (typeof number !== 'string' || !/^\d{3,}$/.test(number) || !Number.isSafeInteger(Number(number))
    || Number(number) !== Number(previous?.number ?? 1) + 1) errors.push('Numéro d’édition suivant requis.');
  if (!text(label)) errors.push('Libellé manquant.');
  if (!isoDate(startsOn) || (previous && startsOn <= previous.startsOn)) errors.push('Date ISO postérieure à l’édition précédente requise.');
  const start = Date.parse(startsOn);
  const window = Date.parse(albumWindowStart);
  if (!isoDate(albumWindowStart) || !(window <= start && start - window <= 14 * 86400000)) {
    errors.push('La fenêtre des sorties doit commencer au plus 14 jours avant l’édition.');
  }

  const knownById = new Map();
  const knownByUrl = new Map();
  for (const item of [...catalog, ...earlier.flatMap(editionItems)]) {
    const url = canonicalUrl(item.url);
    knownById.set(item.id, { url, format: item.format });
    if (url) knownByUrl.set(url, item.id);
  }
  const ids = new Set();
  const urls = new Set();
  for (const [group, format] of Object.entries(formatByGroup)) {
    const items = edition[group];
    if (!Array.isArray(items)) {
      errors.push(group + ' doit être une liste.');
      continue;
    }
    const strictMixLineup=edition.mixPolicy==='nts-nova-youtube-v1';
    const [min, max] = { albums: [3, 3], mixes: strictMixLineup ? [3,5] : [2, Infinity], playlists: [1, 1], live: [3, Infinity] }[group];
    if (items.length < min || items.length > max) errors.push('Quota non respecté pour ' + group + '.');
    for (const item of items) {
      if (!item || item.format !== format || !text(item.id) || !text(item.title) || !text(item.source) || !text(item.reason)) {
        errors.push('Métadonnées ou raison d’écoute invalides dans ' + group + '.');
        continue;
      }
      const url = sourceUrl(item.url);
      const provenance = sourceUrl(item.sourceUrl);
      if (!url || !provenance) errors.push('Liens HTTPS requis pour ' + item.id + '.');
      const key = url && canonicalUrl(url.href);
      if (ids.has(item.id) || (key && urls.has(key))) errors.push('Doublon : ' + item.id + '.');
      const known = knownById.get(item.id);
      if (known && (known.url !== key || known.format !== item.format)) {
        errors.push('Identifiant déjà associé à un autre contenu : ' + item.id + '.');
      }
      if (key && knownByUrl.has(key) && knownByUrl.get(key) !== item.id) {
        errors.push('URL déjà associée à un autre identifiant : ' + item.id + '.');
      }
      ids.add(item.id);
      if (key) urls.add(key);
      if (item.date !== undefined && !isoDate(item.date)) errors.push('Date invalide : ' + item.id + '.');
      if (group === 'albums' && (!isoDate(item.date) || item.date > startsOn)) {
        errors.push('Date de sortie vérifiée manquante ou future : ' + item.id + '.');
      }
      if (group === 'playlists' && !(url?.hostname === 'open.spotify.com' && /^\/(?:intl-[a-z]+\/)?playlist\/[a-zA-Z0-9]{22}\/?$/.test(url.pathname))) {
        errors.push('Lien de playlist Spotify requis : ' + item.id + '.');
      }
      if (item.embed && !validEmbed(item, url)) errors.push('Lecteur invalide ou non vérifié : ' + item.id + '.');
      for (const field of ['creator', 'publisher', 'mood', 'season', 'genre', 'note']) {
        if (item[field] !== undefined && typeof item[field] !== 'string') errors.push('Champ texte invalide : ' + field + '.');
      }
      if (item.artwork !== undefined && !sourceUrl(item.artwork)) errors.push('Visuel HTTPS requis : ' + item.id + '.');
      if (item.minutes !== undefined && !(Number.isFinite(item.minutes) && item.minutes > 0)) errors.push('Durée invalide : ' + item.id + '.');
    }
  }
  const mixes = Array.isArray(edition.mixes) ? edition.mixes : [];
  if (!mixes.some(item => isNts(sourceUrl(item?.url)))) errors.push('Un épisode NTS est obligatoire.');
  if (edition.mixPolicy === 'nts-nova-youtube-v1') {
    const novaPaths={
      'nova-danse':'/radio-nova-nova-danse/',
      'nova-club-mixes':'/radio-nova-nova-club/',
      'nova-worldmix':'/radio-nova-neo-geo-nova-le-worldmix/',
      'nova-teuf-appart':'/teuf-dappart/',
    };
    const nova=mixes.filter(item=>item?.mixKind==='dj-set'
      && novaPaths[item.sourceId] && sourceUrl(item.url)?.hostname==='podcasts.nova.fr'
      && sourceUrl(item.url)?.pathname.startsWith(novaPaths[item.sourceId])
      && (item.sourceId==='nova-danse'||item.novaMixVerified===true));
    const youtube=mixes.filter(item=>item?.mixKind==='curated-mix' && item?.embed?.provider==='youtube'
      && item?.audienceVerified===true && Number.isSafeInteger(item.viewCount) && item.viewCount>=100000
      && item?.mixStyleVerified===true && ['rnb','soul','blues','pop','light-house','funk'].includes(item.mixStyle)
      && !/\b(?:electro|electronic|techno|edm|hard[ -]?house|tech[ -]?house|trance|dubstep)\b/i
        .test([item.title,item.mixStyle,...(item.tags??[])].join(' '))
      && sourceUrl(item.url)?.hostname==='www.youtube.com');
    // Editorial FIP Tape journeys may supplement the NTS/Nova/YouTube trio.
    // The supplement is allowlisted to verified episode URLs; arbitrary mixes
    // cannot bypass the audience and style rules applied to YouTube.
    const fipTapes=mixes.filter(item=>{
      const url=sourceUrl(item?.url);
      return item?.sourceId==='fip-tape' && item?.mixKind==='editorial-mixtape'
        && item?.source==='FIP · Fip Tape'
        && ['www.radiofrance.fr','radiofrance.fr'].includes(url?.hostname)
        && /^\/fip\/podcasts\/fip-tape\/la-mixtape-de-[a-z0-9-]+-\d+\/?$/.test(url.pathname);
    });
    if(mixes.length!==3+fipTapes.length) errors.push('Les compléments aux mixes NTS, Nova et YouTube doivent être des épisodes FIP Tape vérifiés.');
    if(nova.length!==1)errors.push('Un vrai DJ set Radio Nova est obligatoire.');
    if(youtube.length!==1)errors.push('Un mix YouTube à audience vérifiée est obligatoire.');
    if(mixes.filter(item=>isNts(sourceUrl(item?.url))).length!==1)errors.push('Un unique mix NTS est obligatoire.');
  }
  if (!mixes.some(item => item?.id === edition.featuredId && isNts(sourceUrl(item.url)))) errors.push('Le mix vedette doit être un épisode NTS sélectionné.');
  return errors;
}

export function editionItems(edition) {
  return Object.keys(formatByGroup).flatMap(group => edition[group] ?? []);
}

/**
 * @template Draft
 * @param {Draft[]} drafts
 * @param {{ number: string, startsOn: string }} legacy
 * @param {{ id: string, format: string, url: string }[]} catalog
 * @returns {Draft[]}
 */
export function readPublishedEditions(drafts, legacy, catalog) {
  const accepted = [];
  for (const draft of drafts) {
    if (validateEdition(draft, [legacy, ...accepted], catalog).length) break;
    accepted.push(draft);
  }
  return accepted;
}

function validEmbed(item, url) {
  const { provider, id } = item.embed;
  if (provider === 'spotify' && typeof id === 'string' && /^[a-zA-Z0-9]{22}$/.test(id)) {
    const type = item.format === 'Album' ? 'album' : item.format === 'Playlist' ? 'playlist' : '';
    return !!type && url?.hostname === 'open.spotify.com' && canonicalUrl(url.href) === 'https://open.spotify.com/' + type + '/' + id;
  }
  return provider === 'youtube' && typeof id === 'string' && /^[a-zA-Z0-9_-]{11}$/.test(id)
    && (item.format === 'Live session' || item.format === 'Radio show')
    && item.officialVideo === true && item.videoSourceUrl && canonicalUrl(item.videoSourceUrl) === 'https://www.youtube.com/watch?v=' + id;
}

export function canonicalUrl(value) {
  const url = sourceUrl(value);
  if (!url) return undefined;
  if (['www.youtube.com', 'youtube.com', 'youtu.be'].includes(url.hostname)) {
    const id = url.hostname === 'youtu.be' ? url.pathname.slice(1) : url.searchParams.get('v');
    if (id && /^[a-zA-Z0-9_-]{11}$/.test(id)) return 'https://www.youtube.com/watch?v=' + id;
  }
  if (url.hostname === 'nts.live') url.hostname = 'www.nts.live';
  if (url.hostname === 'open.spotify.com') url.pathname = url.pathname.replace(/^\/intl-[a-z]+\//, '/');
  url.hash = '';
  for (const key of [...url.searchParams.keys()]) {
    if (key.startsWith('utm_') || (url.hostname === 'open.spotify.com' && key === 'si')) url.searchParams.delete(key);
  }
  url.searchParams.sort();
  url.pathname = url.pathname.replace(/\/$/, '') || '/';
  return url.href;
}
