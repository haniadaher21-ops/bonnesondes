import {parseSpinitronReader,parseKcrwNowPlaying,parseWxycReader} from '../app/campus-nowplaying.mjs';
const stations=[
  ['KCRW','https://tracklist-api.kcrw.com/Music/all/1','kcrw'],
  ['KALX','https://r.jina.ai/https://programming.kalx.berkeley.edu/KALX/','America/Los_Angeles'],
  ['WRBB','https://r.jina.ai/https://spinitron.com/WRBB/','America/New_York'],
  ['KZSC','https://r.jina.ai/https://spinitron.com/KZSC/','America/Los_Angeles'],
  ['WXYC','https://r.jina.ai/https://api.wxyc.org/flowsheet?limit=30','wxyc'],
];
const time=new Date();
await Promise.all(stations.map(async ([station,url,provider])=>{
 try {
   const response=await fetch(url,{signal:AbortSignal.timeout(15000),headers:{Origin:'https://haniadaher21-ops.github.io',
     ...(provider==='kcrw'?{}:{'X-Cache-Tolerance':'0','X-Respond-With':'markdown'})}});
   let track=null;
   if(response.ok){
     if(provider==='kcrw')track=parseKcrwNowPlaying(await response.json(),time);
     else if(provider==='wxyc')track=parseWxycReader(await response.text(),time);
     else track=parseSpinitronReader(await response.text(),provider,time);
   }
   console.log('REAL_RADIO_VALIDATION '+JSON.stringify({station,status:response.status,
     track:track?{title:track.title,artist:track.artist,kind:track.kind,playedAt:track.playedAt,
       artworkVerified:Boolean(track.artwork)}:null,checkedAt:time.toISOString()}));
 } catch(error){console.log('REAL_RADIO_VALIDATION '+JSON.stringify({station,error:String(error)}))}
}));
