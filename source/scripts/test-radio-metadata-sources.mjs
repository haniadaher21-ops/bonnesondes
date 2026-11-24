import {parseSpinitronReader,parseCampusParisReader,parseRadioCultLive} from '../app/campus-nowplaying.mjs';
const cases=[
 ['KALX','https://r.jina.ai/https://programming.kalx.berkeley.edu/KALX/','America/Los_Angeles'],
 ['WRBB','https://r.jina.ai/https://spinitron.com/WRBB/','America/New_York'],
 ['KZSC','https://r.jina.ai/https://spinitron.com/KZSC/','America/Los_Angeles'],
 ['Campus Paris','https://r.jina.ai/https://www.radiocampusparis.org/c-etait-quoi-ce-titre',null],
 ['Worldwide FM','https://api.radiocult.fm/api/station/worldwide-fm/schedule/live',null],
];
for(const [station,url,zone] of cases){
 try {
   const response=await fetch(url,{headers:{Origin:'https://haniadaher21-ops.github.io'},signal:AbortSignal.timeout(16000)});
   const body=await response.text();
   let result=null;
   if(station==='Campus Paris') result=parseCampusParisReader(body);
   else if(station==='Worldwide FM') result=parseRadioCultLive(JSON.parse(body));
   else result=parseSpinitronReader(body,zone);
   console.log('CHECK_CAMPUS',JSON.stringify({station,code:response.status,cors:response.headers.get('access-control-allow-origin'),
     sourceLength:body.length,matched:Boolean(result),song:result?.title,artist:result?.artist,
     cover:Boolean(result?.artwork),kind:result?.kind,playedAt:result?.playedAt}));
 }catch(error){console.log('CHECK_CAMPUS',JSON.stringify({station,error:String(error.message??error).slice(0,100)}));}
}
