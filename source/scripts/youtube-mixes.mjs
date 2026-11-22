import {isoDate,sourceUrl} from '../editorial/edition.mjs';
import {excludesJazz} from './recommendation-policy.mjs';

// The listener's example is a continuous vintage rhythm & soul playlist.
// Discover similarly curated musical mixes, not just radio programmes.
export const youtubeMixQueries=[
  '60s 70s rhythm soul vinyl playlist mix',
  'soul funk disco eclectic vinyl DJ mix',
  'Kiosk Radio Boiler Room HOR Berlin DJ set',
];

const mixTitle=/\b(?:dj\s*(?:set|mix)|vinyl\s*(?:mix|set|session|selection)|(?:soul|funk|disco|rhythm)\s*(?:mix|playlist|selection)|(?:mixtape|mix tape|mixes|playlist)|boiler room|hör berlin|kiosk radio|the lot radio|my analog journal)\b/i;
const notMix=/\b(?:interview|podcast|talk show|reaction|tutorial|how to|review|full album|official music video|visualizer|shorts?|trailer|teaser|single track|remix tutorial|news)\b/i;
const durationSeconds=value=>{
  if(typeof value!=='string')return 0;
  const m=value.match(/^P(?:([\d.]+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/);
  return m ? Number(m[1]??0)*86400+Number(m[2]??0)*3600+Number(m[3]??0)*60+Number(m[4]??0) : 0;
};
const videoId=value=>typeof value==='string' && /^[\w-]{11}$/.test(value);
const weekStart=startsOn=>new Date(Date.parse(startsOn)-7*86400000).toISOString().slice(0,10);

export function verifiedYouTubeMix(video, startsOn, today) {
  const {snippet={},status={},contentDetails={}}=video??{};
  const id=video?.id;
  const date=snippet.publishedAt?.slice(0,10);
  const title=snippet.title?.trim();
  const channelId=snippet.channelId;
  const channelTitle=snippet.channelTitle?.trim();
  const length=durationSeconds(contentDetails.duration);
  if(!videoId(id)||!videoId(channelId)||!isoDate(date)||!title||!channelTitle
    || !isoDate(startsOn)||!isoDate(today)||date<weekStart(startsOn)||date>=startsOn||date>today
    || status.privacyStatus!=='public'||status.embeddable!==true||length<20*60
    || !mixTitle.test(title)||notMix.test(title)||snippet.liveBroadcastContent==='live')return;
  const tags=(Array.isArray(snippet.tags)?snippet.tags:[]).filter(x=>typeof x==='string').slice(0,40);
  const candidate={
    id:'youtube-'+id,title,creator:channelTitle,format:'Radio show',
    source:'YouTube · '+channelTitle,provider:'YouTube',sourceId:'youtube-mix-'+channelId,
    sourceUrl:'https://www.youtube.com/channel/'+channelId,
    url:'https://www.youtube.com/watch?v='+id,date,dateKind:'published',
    publishedAt:snippet.publishedAt,minutes:length/60,mixKind:'curated-mix',
    verificationStatus:'source-verified',officialVideo:true,
    videoSourceUrl:'https://www.youtube.com/watch?v='+id,
    embed:{provider:'youtube',id},tags,
  };
  const cover=sourceUrl(snippet.thumbnails?.high?.url??snippet.thumbnails?.medium?.url);
  if(cover && (cover.hostname==='i.ytimg.com'||cover.hostname==='img.youtube.com')) candidate.artwork=cover.href;
  if(excludesJazz(candidate))return;
  return candidate;
}

export async function collectYouTubeMixes({startsOn,today,profile={},key,fetcher=fetch}={}) {
  if(!key||!isoDate(startsOn)||!isoDate(today))return {items:[],status:'not-configured'};
  const choices=(Array.isArray(profile.explore)?profile.explore:[])
    .filter(x=>typeof x==='string'&&/^[\p{L}\d -]{3,30}$/u.test(x)&& !/jazz/i.test(x)).slice(0,1);
  const queries=[...youtubeMixQueries,...choices.map(x=>x+' DJ mix vinyl selection')];
  const after=weekStart(startsOn)+'T00:00:00Z',before=startsOn+'T00:00:00Z';
  const found=new Set(),errors=[];
  for(const q of queries){
    const params=new URLSearchParams({part:'snippet',type:'video',videoDuration:'long',order:'date',
      maxResults:'12',publishedAfter:after,publishedBefore:before,q,key});
    try{
      const response=await fetcher('https://www.googleapis.com/youtube/v3/search?'+params.toString(),
        {signal:AbortSignal.timeout(10000),redirect:'error'});
      if(!response.ok)throw new Error('YouTube search '+response.status);
      const data=await response.json();
      if(!Array.isArray(data.items))throw new Error('YouTube search unexpected payload');
      for(const item of data.items)if(videoId(item.id?.videoId))found.add(item.id.videoId);
    }catch(e){errors.push(String(e.message).slice(0,90));}
  }
  const items=[];
  const ids=[...found].slice(0,50);
  if(ids.length){
    const params=new URLSearchParams({part:'snippet,status,contentDetails',id:ids.join(','),key});
    try{
      const response=await fetcher('https://www.googleapis.com/youtube/v3/videos?'+params.toString(),
        {signal:AbortSignal.timeout(15000),redirect:'error'});
      if(!response.ok)throw new Error('YouTube video verification '+response.status);
      const payload=await response.json();
      if(!Array.isArray(payload.items))throw new Error('YouTube videos unexpected payload');
      for(const video of payload.items){
        const candidate=verifiedYouTubeMix(video,startsOn,today);
        if(candidate)items.push(candidate);
      }
    }catch(e){errors.push(String(e.message).slice(0,90));}
  }
  return {items:items.slice(0,20),status:errors.length?'partial: '+errors.length+' provider request(s) unavailable':'ok',
    found:found.size,queries:queries.length};
}
