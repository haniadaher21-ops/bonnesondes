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
    || (host==='pitchfork.com' && /^\/reviews\/albums\/[^/]+\/?$/.test(path) && kind==='critic-pick');
  if (!verified) return;
  return {source:item.editorialSource,kind,url:url.origin+url.pathname,
    claim:item.editorialClaim??(kind==='critic-pick'?'Best New Music':'Sélection éditoriale')};
}


// A mix is a recent continuous musical DJ set, not a spoken music program.
// Edition 002 goes live on Monday: the eligible shows aired the previous Mon–Sun.
const spokenProgram = /(?:\binterview\b|\btalk(?:show)?\b|\bnews\b|\bpodcast\b|\bdiscussion\b|\bchronique\b|\binvité(?:e|s|es)?\b|\binvitée\b|\bmatinale\b|\bentretien\b)/i;
export function isFreshMusicMix(item, startsOn, today) {
  if(item?.format!=='Radio show' || item.mixKind!=='dj-set' || !isoDate(item.date)
    || !isoDate(startsOn) || !isoDate(today)) return false;
  const min=new Date(Date.parse(startsOn)-7*86400000).toISOString().slice(0,10);
  const max=new Date(Date.parse(startsOn)-86400000).toISOString().slice(0,10);
  return item.date>=min && item.date<=max && item.date<=today
    && !spokenProgram.test(item.title??'');
}
