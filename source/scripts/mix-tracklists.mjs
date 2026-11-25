import {sourceUrl} from '../editorial/edition.mjs';

const clean=value=>typeof value==='string'?value.normalize('NFC').replace(/\s+/gu,' ').trim():'';
const unknown=/^(?:unknown(?: artist| track| title)?|unidentified|unreleased|id|id track|untitled|inconnu|inconnue|non identifié|n\/a|\?+|-+)$/i;
const safeField=value=>{const s=clean(value);return s&&s.length<=240&&!unknown.test(s)&&!/[<>]|https?:\/\//i.test(s)?s:undefined;};
const pair=(artist,title)=>{
  const a=safeField(artist),t=safeField(title);
  return a&&t?{artist:a,title:t}:undefined;
};
export function normalizeTracks(rows){
  const result=[],seen=new Set();
  for(const row of Array.isArray(rows)?rows:[]){
    const track=pair(row?.artist,row?.title);
    if(!track)continue;
    const key=(track.artist+'\0'+track.title).toLowerCase();
    if(seen.has(key))continue;
    seen.add(key);result.push(track);
    if(result.length>=100)break;
  }
  return result;
}
export function ntsTracks(payload){
  const rows=payload?.results??payload?.embeds?.tracklist?.results;
  return normalizeTracks(rows);
}
const heading=/^(?:\s*[-=*#🎵🎶]*\s*)?(?:track\s*list(?:ing)?|track\s*ids?|playlist|set\s*list|liste des morceaux|programmation musicale|titres diffusés|les titres diffusés|les morceaux diffusés)(?:\s*[:：\-–—]?\s*)$/iu;
const timestamp=/^\s*(?:\[\s*)?(?:\d{1,2}:)?\d{1,3}:\d{2}(?:\s*\])?\s*[-–—.:]?\s*/;
const numbered=/^\s*\d{1,3}[.)]\s+/;
const footer=/^(?:follow|subscribe|support|credits?|links?|socials?|contact|booking|filmed|recorded|produced|thank|more (?:music|mixes)|abonnez|suivez|crédits?|écouter|listen|source|disclaimer|copyright|about)\b/i;
function lineTrack(line){
  const value=line.replace(timestamp,'').replace(numbered,'').replace(/^\s*[•*]\s*/,'').trim();
  if(/^(?:artist|artiste|track|title|titre)\s*[-–—/]\s*(?:artist|artiste|track|title|titre)$/i.test(value))return;
  if(footer.test(value)||/https?:\/\/|@[\w]+|^#/.test(value))return;
  const m=value.match(/^(.+?)\s+[-–—]\s+(.+)$/);
  return m?pair(m[1],m[2]):undefined;
}
// Only explicit tracklist blocks, or consecutive timestamped artist-title rows.
// A single chapter label, credits or random descriptive prose is not a tracklist.
export function descriptionTracks(description){
  if(typeof description!=='string')return [];
  const lines=description.slice(0,50000).split(/\r?\n/);
  const explicit=[],timed=[];
  let inBlock=false,run=[];
  const flush=()=>{if(run.length>=3)timed.push(...run);run=[];};
  for(const raw of lines){
    const line=raw.trim();
    if(/^(?:artist|artiste|track|title|titre)\s*[-–—/]\s*(?:artist|artiste|track|title|titre)$/i.test(line)){inBlock=true;flush();continue;}
    if(heading.test(line)){inBlock=true;flush();continue;}
    if(!line){flush();if(explicit.length)inBlock=false;continue;}
    if(footer.test(line)){inBlock=false;flush();continue;}
    const track=lineTrack(line);
    if(inBlock&&track)explicit.push(track);
    else if(inBlock&&!track)inBlock=false;
    if(timestamp.test(line)&&track)run.push(track);else flush();
  }
  flush();
  const rows=normalizeTracks(explicit.length>=2?explicit:timed);
  return rows.length>=2?rows:[];
}
// YouTube descriptions can list title before artist. Confirm orientation using a
// declared order or repeated artist names in the video title. Never guess.
export function youtubeDescriptionTracks(description,videoTitle){
  const rows=descriptionTracks(description);
  if(!rows.length)return {tracks:[],status:'unavailable'};
  const order=String(description??'').match(/^\s*(?:track\s*list\s*[:(]\s*)?(artist|track|title|artiste|titre)\s*[-–—/]\s*(artist|track|title|artiste|titre)\s*\)?\s*$/im);
  const artistWord=x=>/^(?:artist|artiste)$/i.test(x);
  if(order&&artistWord(order[1])!==artistWord(order[2]))return {tracks:artistWord(order[1])?rows:rows.map(x=>({artist:x.title,title:x.artist})),status:'available'};
  const norm=x=>' '+String(x??'').normalize('NFKD').replace(/\p{M}/gu,'').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim()+' ';
  const name=norm(videoTitle);
  const count=key=>new Set(rows.map(x=>norm(x[key])).filter(x=>x.trim().length>=3&&name.includes(x))).size;
  const forward=count('artist'),reverse=count('title');
  if(forward>=2&&forward>=reverse+2)return {tracks:rows,status:'available'};
  if(reverse>=2&&reverse>=forward+2)return {tracks:rows.map(x=>({artist:x.title,title:x.artist})),status:'available'};
  return {tracks:[],status:'ambiguous',unresolvedCount:rows.length};
}
function htmlText(html){
  return html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,'')
    .replace(/<br\s*\/?>|<\/(?:p|li|h[1-6]|div|tr)>/gi,'\n')
    .replace(/<[^>]+>/g,'')
    .replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;|&apos;/g,"'")
    .replace(/&nbsp;|&#160;/g,' ').replace(/&ndash;/g,'–').replace(/&mdash;/g,'—');
}
export function fipTracks(html){
  if(typeof html!=='string')return [];
  // Radio France renders this episode's own timeline as Song cards. Restrict
  // the extraction to the list immediately after its programming heading.
  const markup=html.replace(/<!--[\s\S]*?-->/g,'');
  const section=markup.match(/<h[1-6]\b[^>]*>\s*Programmation musicale\s*<\/h[1-6]>([\s\S]*?)<ul\b[^>]*class=["'][^"']*\btimeline\b[^"']*["'][^>]*>([\s\S]*?)<\/ul>/i);
  if(section && section[1].length<4000){
    const rows=[];
    for(const match of section[2].matchAll(/<li\b[^>]*\bclass=["'][^"']*\btimeline-item\b[^"']*["'][^>]*>([\s\S]*?)<\/li>/gi)){
      const card=match[1];
      if(!/<div\b[^>]*\b__typename=["']Song["']/i.test(card))continue;
      const artist=card.match(/<p\b[^>]*\bid=["']title-[^"']+["'][^>]*>([\s\S]*?)<\/p>/i);
      const title=card.match(/<p\b[^>]*\bid=["']subtext-[^"']+["'][^>]*>([\s\S]*?)<\/p>/i);
      if(artist&&title)rows.push({artist:htmlText(artist[1]),title:htmlText(title[1])});
    }
    const tracks=normalizeTracks(rows);
    if(tracks.length>=2)return tracks;
  }
  // Accept only a MusicPlaylist's structured recordings, not unrelated recommendations.
  for(const match of html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)){
    try{
      const parsed=JSON.parse(match[1]);
      const nodes=[parsed,...(Array.isArray(parsed)?parsed:[]),...(Array.isArray(parsed?.['@graph'])?parsed['@graph']:[])];
      for(const node of nodes){
        if(node?.['@type']!=='MusicPlaylist'||!Array.isArray(node.track))continue;
        const rows=normalizeTracks(node.track.map(track=>({artist:track?.byArtist?.name,title:track?.name})));
        if(rows.length>=2)return rows;
      }
    }catch{/* Other blocks may be usable. */}
  }
  return descriptionTracks(htmlText(html));
}
export function tracklistEvidence(tracks,url,method,now){
  const rows=normalizeTracks(tracks);
  if(rows.length<2||!sourceUrl(url))return;
  return {tracks:rows,sourceUrl:url,method,checkedAt:now.toISOString(),status:'available'};
}
function ntsEndpoint(item){
  const url=sourceUrl(item.url);
  if(url?.origin!=='https://www.nts.live'||!/^\/shows\/[a-z0-9-]+\/episodes\/[a-z0-9-]+$/.test(url.pathname))return;
  const endpoint='https://www.nts.live/api/v2'+url.pathname+'/tracklist';
  // Do not follow arbitrary links from a feed.
  return endpoint;
}
export async function enrichRadioTracklists(candidates,{fetcher=fetch,now=new Date(),limit=32}={}){
  const diagnostics={attempted:0,available:0,missing:0,errors:0,cached:0,bySource:{}};
  const items=[];
  const blocked=new Set();
  const request=async url=>{
    const origin=new URL(url).origin;
    if(blocked.has(origin))throw new Error('rate-limited');
    const response=await fetcher(url,{signal:AbortSignal.timeout(10000),redirect:'error'});
    if(response.status===429)blocked.add(origin);
    if(!response.ok)throw new Error('HTTP '+response.status);
    return response;
  };
  for(const item of candidates){
    const nts=item.format==='Radio show'&&ntsEndpoint(item);
    const fip=item.format==='Radio show'&&item.sourceId==='fip-tape'&&/^https:\/\/www\.radiofrance\.fr\/fip\/podcasts\/fip-tape\/la-mixtape-de-[a-z0-9-]+-\d+\/?$/.test(item.url);
    if(!nts&&!fip){
      if(item.tracklist?.method==='youtube-description'&&now-Date.parse(item.tracklist.checkedAt)>=30*86400000){const {tracklist,...rest}=item;items.push(rest);}
      else items.push(item);
      continue;
    }
    const provider=nts?'NTS':'FIP Tape';
    const counts=diagnostics.bySource[provider]??={attempted:0,available:0,missing:0,errors:0,cached:0};
    const cached=item.tracklist;
    const age=now-Date.parse(cached?.checkedAt);
    if(age>=0&&age<(cached.status==='available'?14:1)*86400000){
      diagnostics.cached++;counts.cached++;items.push(item);continue;
    }
    if(diagnostics.attempted>=limit){items.push(item);continue;}
    diagnostics.attempted++;counts.attempted++;
    const url=nts||item.url;
    try{
      const response=await request(url);
      let tracks=nts?ntsTracks(await response.json()):fipTracks(await response.text());
      let provenance=url,method=nts?'nts-api':'fip-page';
      if(nts&&tracks.length<2){
        const detail=url.replace(/\/tracklist$/,'');
        const fallback=await request(detail);
        tracks=ntsTracks(await fallback.json());provenance=detail;
      }
      const evidence=tracklistEvidence(tracks,provenance,method,now);
      if(evidence){diagnostics.available++;counts.available++;items.push({...item,tracklist:evidence});}
      else{diagnostics.missing++;counts.missing++;items.push({...item,tracklist:{status:'unavailable',sourceUrl:provenance,method,checkedAt:now.toISOString()}});}
    }catch{
      diagnostics.errors++;counts.errors++;
      items.push({...item,tracklist:cached?.status==='available'?cached:{status:'unavailable',sourceUrl:url,method:nts?'nts-api':'fip-page',checkedAt:now.toISOString()}});
    }
  }
  return {items,diagnostics};
}
