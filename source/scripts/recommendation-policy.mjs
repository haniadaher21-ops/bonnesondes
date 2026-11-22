import { normalized } from './release-metadata.mjs';
import { isoDate, sourceUrl } from '../editorial/edition.mjs';

// Never infer a musical genre from the hosting radio or video channel alone.
// For jazz-dedicated programmes and labels with mixed/undocumented metadata,
// fail closed rather than recommending jazz under an unlabelled genre.
const jazz = /(?:\bjazz\b|jazzafip|jazz\s*re:?freshed|\bbebop\b|\bhard[ -]?bop\b|\bfree[ -]?jazz\b|\bswing jazz\b|\bpost[ -]?bop\b|\bjazz[ -]?fusion\b)/i;
const jazzFocusedAlbumLabels = new Set(['ecm','international anthem','gondwana records','jazz re:freshed']);
export function excludesJazz(item) {
  const fields = [item.genre,item.mood,item.title,item.sourceId,item.source,
    ...(Array.isArray(item.tags) ? item.tags : []),...(Array.isArray(item.genres) ? item.genres : [])];
  if(fields.some(value=>typeof value==='string' && jazz.test(value)))return true;
  return item.format==='Album' && jazzFocusedAlbumLabels.has(normalized(item.provider??item.source??''));
}

// Parse the real performer, not the channel (KEXP, COLORS, BBC, NPR, triple j).
// Unrecognized titles stay unassigned: we never invent an artist.
export function livePerformer(title, knownArtist) {
  if(typeof knownArtist==='string' && knownArtist.trim())return knownArtist.trim();
  if(typeof title!=='string')return;
  const raw=title.trim();
  if(!raw)return;
  const candidates=[
    raw.match(/^(.+?)\s+covers?\s+.+?\s+(?:for\s+)?Like A Version\b/i)?.[1],
    raw.match(/^(.+?)\s*:\s*Tiny Desk(?:\s+Concert)?\b/i)?.[1],
    raw.match(/^(.+?)\s*[-–—]\s*.+?\s*\(?Live on KEXP\)?/i)?.[1],
    raw.match(/^(.+?)\s*[-–—]\s*.+?\s*(?:\||\()?\s*(?:A COLORS SHOW|BBC Radio 1 Live Lounge|Live Lounge)\b/i)?.[1],
    raw.match(/^(.+?)\s*[-–—]\s*.+?\s*(?:\||\()?\s*(?:Like A Version|Tiny Desk Concert)\b/i)?.[1],
    raw.match(/^(.+?)\s*[|–—-]\s*(?:A COLORS SHOW|Live on KEXP|Live Lounge|Tiny Desk Concert)\b/i)?.[1],
  ];
  const artist=candidates.find(x=>typeof x==='string' && x.trim().length>1)?.trim();
  if(!artist || /^(?:live|full performance|official|session|concert)$/i.test(artist))return;
  return artist;
}


// An album earns recommendation status only when a real editorial selection names
// that specific album. Neither a label catalogue nor a routine review is sufficient.
export function editorialEndorsement(item) {
  if (item?.format !== 'Album' || !item?.editorialUrl || !item?.editorialKind) return;
  const url = sourceUrl(item.editorialUrl);
  if (!url || url.port) return;
  const host=url.hostname.replace(/^www\./,'');
  const path=url.pathname.toLowerCase();
  const kind=item.editorialKind;
  const verified =
    (host==='daily.bandcamp.com' && path.startsWith('/album-of-the-day/') && kind==='curator-pick')
    || (host==='bandcamp.substack.com' && /^\/p\/i-love-this-record(?:-|$)/.test(path) && kind==='curator-pick')
    || (host==='pitchfork.com' && /^\/reviews\/albums\/[a-z0-9-]+\/?$/.test(path) && kind==='critic-pick');
  const mediaDay=item.editorialPublishedAt;
  const mediaIsRecent=isoDate(mediaDay);
  const mediaPick=kind==='curator-pick' && mediaIsRecent && (
    (['www.nova.fr','nova.fr'].includes(host) && /^\/news\/[a-z0-9-]*albums-immanquables-de-la-semaine[a-z0-9-]*\/?$/.test(path))
    || (host==='stereogum.com' && /^\/\d+\/album-of-the-week-[a-z0-9-]+\/reviews\/album-of-the-week\/?$/.test(path))
    || (host==='pitchfork.com' && /^\/story\/\d+-new-albums-you-should-listen-to-now-[a-z0-9-]+\/?$/.test(path))
  );
  if (!verified && !mediaPick) return;
  return {source:item.editorialSource,kind,url:url.origin+url.pathname,
    claim:item.editorialClaim??(kind==='critic-pick'?'Best New Music':'Sélection éditoriale')};
}


// Three intentionally separate editorial sources: NTS, Radio Nova and YouTube.
// A Nova Danse DJ set may be up to 14 days old if the station did not release a
// new podcast last week. Its real date remains visible; never fabricate freshness.
export function isNovaMix(item) {
  if(item?.format!=='Radio show'||item.mixKind!=='dj-set'
    || !(item.provider==='Radio Nova'||/Radio Nova/i.test(item.source??'')))return false;
  const paths={
    'nova-danse':'/radio-nova-nova-danse/',
    'nova-club-mixes':'/radio-nova-nova-club/',
    'nova-worldmix':'/radio-nova-neo-geo-nova-le-worldmix/',
    'nova-teuf-appart':'/teuf-dappart/',
  };
  const prefix=paths[item.sourceId];
  const url=sourceUrl(item.url);
  return !!prefix&&url?.hostname==='podcasts.nova.fr'&&url.pathname.startsWith(prefix)
    && url.pathname.length>prefix.length
    && (item.sourceId==='nova-danse'||item.novaMixVerified===true);
}
export function isNtsMix(item) {
  return item?.format==='Radio show' && item?.mixKind==='dj-set'
    && /^https:\/\/(?:www\.)?nts\.live\/shows\/[a-z0-9-]+\/episodes\/[a-z0-9-]+$/.test(
      new URL(item?.url??'https://invalid.local').origin + new URL(item?.url??'https://invalid.local').pathname);
}
export const MIN_YOUTUBE_MIX_VIEWS = 100000;
export const preferredYouTubeMixStyles = ['rnb','soul','blues','pop','light-house','funk'];
const forbiddenElectronic = /\b(?:electro(?:nic|nica)?|techno|tech[ -]?house|edm|hardstyle|hard[ -]?house|industrial|trance|rave|dubstep|drum[ -]?(?:and|&|n)[ -]?bass|dnb|psytrance|breakcore|gabber|hardcore[ -]?dance|big[ -]?room|acid[ -]?techno)\b/i;
export function excludesElectronicMix(item) {
  return forbiddenElectronic.test([item?.title,item?.genre,item?.mood,item?.mixStyle,
    ...(Array.isArray(item?.tags)?item.tags:[])].filter(Boolean).join(' '));
}
export function isYouTubeMix(item) {
  return item?.format==='Radio show' && item?.mixKind==='curated-mix'
    && item.embed?.provider==='youtube' && item.audienceVerified===true
    && Number.isSafeInteger(item.viewCount) && item.viewCount>=MIN_YOUTUBE_MIX_VIEWS
    && item.mixStyleVerified===true && preferredYouTubeMixStyles.includes(item.mixStyle)
    && !excludesElectronicMix(item) && !excludesJazz(item);
}
const spokenProgram = /(?:\binterview\b|\btalk(?:show)?\b|\bnews\b|\bpodcast\b|\bdiscussion\b|\bchronique\b|\binvité(?:e|s|es)?\b|\binvitée\b|\bmatinale\b|\bentretien\b)/i;
export function isFreshMusicMix(item, startsOn, today) {
  if(item?.format!=='Radio show' || !['dj-set','curated-mix'].includes(item.mixKind) || !isoDate(item.date)
    || !isoDate(startsOn) || !isoDate(today) || spokenProgram.test(item.title??''))return false;
  // NTS is weekly, Nova can use its last set, and YouTube must reach 100k
  // views. Give YouTube up to a year, favoring freshness within that window.
  const lookback=item.mixKind==='curated-mix'?365:isNovaMix(item)?14:7;
  const min=new Date(Date.parse(startsOn)-lookback*86400000).toISOString().slice(0,10);
  const max=new Date(Date.parse(startsOn)-86400000).toISOString().slice(0,10);
  return item.date>=min && item.date<=max && item.date<=today;
}
