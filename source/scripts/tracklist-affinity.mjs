import {sourceUrl,canonicalUrl} from '../editorial/edition.mjs';
import {normalizeTracks} from './mix-tracklists.mjs';

const artistKey=value=>typeof value==='string'?value.normalize('NFC').toLowerCase().replace(/\s+/gu,' ').trim():'';
const DAY=86400000;
// Do not treat a DJ, curator, label or channel as a performer simply because
// the listener saved their mix. Only reactions on identified albums and lives
// in the editorial catalogue are reliable signals for this first version.
export function buildArtistAffinity(profile,known){
  const favorites=new Set(profile.favoriteArtists.map(artistKey).filter(Boolean));
  const performers=new Map(known.filter(item=>['Album','Live session'].includes(item.format)&&artistKey(item.creator)).map(item=>[item.id,artistKey(item.creator)]));
  const reactions=new Map();
  for(const item of profile.signals.items){
    const key=performers.get(item.id);
    if(!key)continue;
    const signal=reactions.get(key)??{positive:0,negative:0};
    if(item.reaction==='Not for me')signal.negative++;
    else if(item.reaction==='Loved'||item.reaction==='Worth revisiting'||item.reaction==='Interesting'||item.saved)signal.positive++;
    reactions.set(key,signal);
  }
  return {favorites,reactions};
}
function validEvidence(item,now){
  if(item.format!=='Radio show'||!['dj-set','curated-mix','editorial-mixtape'].includes(item.mixKind))return false;
  const e=item.tracklist,url=sourceUrl(item.url),proof=sourceUrl(e?.sourceUrl);
  if(e?.status!=='available'||!url||!proof||url.port||proof.port)return false;
  const age=+now-Date.parse(e.checkedAt);
  if(!Number.isFinite(age)||age<0||age>=30*DAY)return false;
  if(e.method==='nts-api')return url.origin==='https://www.nts.live'&&/^\/shows\/[a-z0-9-]+\/episodes\/[a-z0-9-]+$/.test(url.pathname)
    &&proof.origin===url.origin&&[ '/api/v2'+url.pathname, '/api/v2'+url.pathname+'/tracklist'].includes(proof.pathname);
  if(e.method==='fip-page')return item.sourceId==='fip-tape'&&url.origin==='https://www.radiofrance.fr'
    &&/^\/fip\/podcasts\/fip-tape\/la-mixtape-de-[a-z0-9-]+-\d+\/?$/.test(url.pathname)&&canonicalUrl(url.href)===canonicalUrl(proof.href);
  if(e.method==='youtube-description')return item.mixKind==='curated-mix'&&url.origin==='https://www.youtube.com'
    &&url.pathname==='/watch'&&/^[\w-]{11}$/.test(url.searchParams.get('v')??'')&&canonicalUrl(url.href)===canonicalUrl(proof.href);
  return false;
}
// Each distinct artist counts once. Unknown artists are neutral. Caps and a
// modest coverage component avoid rewarding repetitive or very long lists.
export function mixTracklistAffinity(item,index,now){
  const empty={available:false,tracks:0,artists:0,favorites:0,liked:0,disliked:0,unknown:0,points:0};
  if(!validEvidence(item,now))return empty;
  const tracks=normalizeTracks(item.tracklist.tracks);
  if(tracks.length<2)return empty;
  const artists=new Set(tracks.map(row=>artistKey(row.artist)).filter(Boolean));
  let favorites=0,liked=0,disliked=0;
  for(const artist of artists){
    if(index.favorites.has(artist)){favorites++;continue;}
    const signal=index.reactions.get(artist);
    if(signal?.positive>signal?.negative)liked++;
    else if(signal?.negative>signal?.positive)disliked++;
  }
  const positive=favorites+liked;
  const bonus=Math.min(48,12*favorites+6*liked+Math.round(12*positive/Math.max(5,artists.size)));
  const penalty=Math.min(24,8*disliked);
  // FIP timelines can include tracks on the edge of a show, and YouTube
  // descriptions establish the artist/title order heuristically. Weight less.
  const confidence=item.tracklist.method==='nts-api'?1:0.75;
  return {available:true,tracks:tracks.length,artists:artists.size,favorites,liked,disliked,
    unknown:artists.size-positive-disliked,points:Math.round((bonus-penalty)*confidence)};
}
