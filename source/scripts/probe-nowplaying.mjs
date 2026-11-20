// Temporary diagnostic, public network calls only; do not print credentials.
const stations=[
  ['Nova','novazz.ice.infomaniak.ch','novazz-128.mp3','radio-nova'],
  ['Nouvo','nova-nouvo.ice.infomaniak.ch','nova-nouvo-128.mp3','nouvo-nova'],
  ['La nuit','nova-ln.ice.infomaniak.ch','nova-ln-128.mp3','nova-lanuit']
];
const requests=[];
for(const [name,host,mp3,slug] of stations){
  requests.push([name+' station HTML','https://www.nova.fr/radios/'+slug+'/','page']);
  requests.push([name+' stream ICY','https://'+host+'/'+mp3,'stream']);
  requests.push([name+' Icecast status','https://'+host+'/status-json.xsl','json']);
  requests.push([name+' Reader HTML','https://r.jina.ai/https://www.nova.fr/radios/'+slug+'/','reader']);
}
requests.push(['Nova WP API','https://www.nova.fr/wp-json/','routes']);
requests.push(['Nova radio-tracks','https://www.nova.fr/wp-json/radio-tracks/v1/latests','json']);
requests.push(['Nova mobile app','https://www.nova.fr/wp-json/mobile-app/v1/cqct/radio-nova','json']);
requests.push(['Infomaniak radio/novazz','https://metadata.infomaniak.com/api/radio/novazz/metadata','json']);
requests.push(['Nova direct mobile','https://www.nova.fr/wp-json/radios/radio-nova','json']);
requests.push(['Nova history old','https://www.nova.fr/wp-json/radios/all-radios','json']);
function excerpt(text){
 let found=[...text.matchAll(/(?:wwtt_content|player-radio\.infomaniak|metadata\.infomaniak|tracklist|icy[-_]metadata|radio-tracks|radio_id|station_id|radio-nouvo|novazz|C'ÉTAIT QUOI CE TITRE|www\.nova\.fr\/wp-json)/gi)].slice(0,14);
 return found.map(m=>({at:m.index,text:text.slice(Math.max(0,m.index-85),m.index+145)}));
}
async function check([name,url,kind]) {
 const controller=new AbortController();
 const timeout=setTimeout(()=>controller.abort(),12000);
 let res;
 try{
  const headers={
   Origin:'https://haniadaher21-ops.github.io',
   'User-Agent':'BonnesOndes-SourceVerification/1.0',
   ...(kind==='stream'?{'Icy-MetaData':'1'}:{}),
   ...(kind==='reader'?{'X-Respond-With':'html','X-Target-Selector':'.what_was_title .swiper-slide:first-child','X-Cache-Tolerance':'60'}:{})
  };
  res=await fetch(url,{signal:controller.signal,headers,redirect:'follow'});
  const result={name,status:res.status,type:res.headers.get('content-type'),cors:res.headers.get('access-control-allow-origin'),icyMetaInt:res.headers.get('icy-metaint'),icyName:res.headers.get('icy-name'),location:res.url};
  if(kind==='stream'){
    const metaint=Number(res.headers.get('icy-metaint')??0);
    if(metaint>0&&metaint<150000&&res.body){
     const reader=res.body.getReader();let got=0, chunks=[];
     while(got < metaint+4081){
       const frame=await reader.read();
       if(frame.done)break;
       chunks.push(frame.value);got+=frame.value.length;
     }
     await reader.cancel().catch(()=>{});
     const buffer=Buffer.concat(chunks.map(c=>Buffer.from(c)));
     const metadataLength=buffer[metaint]*16;
     result.sampleIcy=buffer.subarray(metaint+1,metaint+1+Math.min(metadataLength,1000)).toString('utf8');
    } else {await res.body?.cancel().catch(()=>{});}
  } else {
   const body=(await res.text()).slice(0,420000);
   if(kind==='routes'){
    try{const json=JSON.parse(body);result.routes=Object.keys(json.routes??{}).filter(x=>/nova|radio|track|titre|cqct|history|metadata/.test(x)).slice(0,55)}
    catch{result.snippet=body.slice(0,180);}
   } else if(kind==='page'){result.excerpt=excerpt(body);result.bytes=body.length;result.first=body.slice(0,100);}
   else if(kind==='reader'){result.excerpt=excerpt(body);result.bytes=body.length;result.first=body.slice(0,650);}
   else {
    try{const j=JSON.parse(body);result.json=JSON.stringify(j).slice(0,450)}
    catch{result.snippet=body.slice(0,230);}
   }
  }
  console.log('NOVA_PROBE '+JSON.stringify(result));
 }catch(e){
  console.log('NOVA_PROBE '+JSON.stringify({name,error:e.name+': '+String(e.message).slice(0,95)}));
 }finally{clearTimeout(timeout);if(res?.body&&!res.bodyUsed)try{await res.body.cancel()}catch{}}
}
await Promise.all(requests.map(check));
