import {isoDate,sourceUrl,parisDate} from '../editorial/edition.mjs';
import {livePerformer} from './recommendation-policy.mjs';
const DAY=86400000;
const idOk=id=>typeof id==='string'&&/^[\w-]{11}$/.test(id);
const channelOk=id=>typeof id==='string'&&/^UC[\w-]{22}$/.test(id);
const excluded=/\b(?:shorts?|interview|behind the scenes|teaser|trailer|sneak peek|official music video|preview|highlight(?:s)?|extrait)\b/i;
const key=s=>String(s??'').normalize('NFKC').toLowerCase();
export function archivedLiveCandidate(row,source,now){
 const sn=row?.snippet??{},cd=row?.contentDetails??{};
 const id=cd.videoId??sn.resourceId?.videoId;
 const date=cd.videoPublishedAt?.slice(0,10),title=sn.title?.trim();
 const today=parisDate(now),earliest=new Date(Date.parse(today)-90*DAY).toISOString().slice(0,10);
 if(!idOk(id)||!isoDate(date)||date<earliest||date>today||!title||excluded.test(title)||
    sn.videoOwnerChannelId!==source.channelId||
    (source.titleContains&&!key(title).includes(key(source.titleContains)))||
    (source.titleMatchesAny&&!source.titleMatchesAny.some(x=>key(title).includes(key(x)))))return;
 const creator=livePerformer(title,source.artist);
 if(!creator)return;
 const url='https://www.youtube.com/watch?v='+id;
 const artwork=sourceUrl(sn.thumbnails?.high?.url??sn.thumbnails?.medium?.url);
 return {id:'youtube-'+id,title,creator,format:'Live session',source:source.name,provider:'YouTube',sourceId:source.id,sourceUrl:source.url,url,
 date,dateKind:'published',publishedAt:cd.videoPublishedAt,officialVideo:true,videoSourceUrl:url,embed:{provider:'youtube',id},
 verificationStatus:'source-verified',collectedAt:now.toISOString(),...(artwork?.hostname==='i.ytimg.com'&&{artwork:artwork.href})};
}
// Upload playlists are cheap compared with search.list. Bound each source
// independently; never invent videos, and verify duration/embeddability later.
export async function collectRecentLives({sources,key:apiKey,now=new Date(),fetcher=fetch,pages=4,perSource=80}={}){
 const configured=(sources??[]).filter(s=>s.method==='youtube-atom'&&s.mode==='automatic'&&!s.onlyWhenFollowed&&channelOk(s.channelId));
 if(!apiKey||!configured.length)return {items:[],status:'not-configured',sources:[]};
 const request=async(path,params)=>{
  const response=await fetcher('https://www.googleapis.com/youtube/v3/'+path+'?'+new URLSearchParams(params),{headers:{'x-goog-api-key':apiKey},signal:AbortSignal.timeout(15000),redirect:'error'});
  if(!response.ok)throw Error('YouTube '+path+' HTTP '+response.status);
  const data=await response.json();if(!Array.isArray(data.items))throw Error('Invalid YouTube response');return data;
 };
 let channels;
 try{channels=await request('channels',{part:'contentDetails',id:[...new Set(configured.map(s=>s.channelId))].join(',')});}
 catch{return {items:[],status:'unavailable',sources:[]};}
 const uploads=new Map(channels.items.map(c=>[c.id,c.contentDetails?.relatedPlaylists?.uploads]));
 const all=[],diagnostics=[];
 const earliest=new Date(Date.parse(parisDate(now))-90*DAY).toISOString().slice(0,10);
 for(const source of configured){
  const playlist=uploads.get(source.channelId),items=[],seen=new Set();let pageToken,read=0,status='ok';
  if(typeof playlist!=='string'||!/^UU[\w-]{22}$/.test(playlist)){diagnostics.push({sourceId:source.id,count:0,status:'no-uploads'});continue;}
  try{
   for(let p=0;p<Math.min(6,Math.max(1,pages));p++){
    const data=await request('playlistItems',{part:'snippet,contentDetails',playlistId:playlist,maxResults:'50',...(pageToken&&{pageToken})});
    read++;
    for(const row of data.items){
     const item=archivedLiveCandidate(row,source,now);
     if(item&&!seen.has(item.id)&&items.length<perSource){seen.add(item.id);items.push(item);}
    }
    const dates=data.items.map(x=>x.contentDetails?.videoPublishedAt?.slice(0,10)).filter(isoDate);
    if(!data.nextPageToken||items.length>=perSource||(dates.length===data.items.length&&dates.length&&dates.every(d=>d<earliest)))break;
    if(data.nextPageToken===pageToken)break;
    pageToken=data.nextPageToken;
    if(p===Math.min(6,Math.max(1,pages))-1)status='bounded';
   }
  }catch{status=items.length?'partial':'unavailable';}
  all.push(...items);diagnostics.push({sourceId:source.id,count:items.length,pages:read,status});
 }
 return {items:[...new Map(all.map(x=>[x.id,x])).values()],status:diagnostics.some(x=>['partial','unavailable','bounded'].includes(x.status))?'partial':'ok',sources:diagnostics};
}
