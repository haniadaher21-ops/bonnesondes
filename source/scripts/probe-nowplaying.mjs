// Temporary, public-only Nova API and artwork research.
const cases=[
 ['Nova route catalogue','https://www.nova.fr/wp-json/','root'],
 ['Nova latest default','https://www.nova.fr/wp-json/radio-tracks/v1/latests','api'],
 ...[
 ['radio','radio-nova'],['radio','nouvo-nova'],['radio','nova-lanuit'],
 ['id','910'],['id_radio','910'],['radio_id','910'],['station_id','910'],['station','radio-nova'],
 ].map(([key,value])=>['Nova latest '+key+'='+value,'https://www.nova.fr/wp-json/radio-tracks/v1/latests?'+key+'='+value,'api']),
 ['Nova radio WP','https://www.nova.fr/wp-json/wp/v2/radios/910','wp'],
 ['Nouvo radio WP','https://www.nova.fr/wp-json/wp/v2/radios/79676','wp'],
 ['Night radio WP','https://www.nova.fr/wp-json/wp/v2/radios/916','wp'],
 ['Nova Reader','https://r.jina.ai/https://www.nova.fr/radios/radio-nova/','html'],
 ['Nouvo Reader','https://r.jina.ai/https://www.nova.fr/radios/nouvo-nova/','html'],
 ['Night Reader','https://r.jina.ai/https://www.nova.fr/radios/nova-lanuit/','html'],
 ['Nova Radio first-party HTML','https://www.nova.fr/radios/radio-nova/','page'],
 ];
function sampleHtml(body){
 const start=body.indexOf('<div class="wwtt_imgcontent">');
 let img=start>=0 ? body.slice(start,start+1800) : '';
 let m=[null,img];
 return {img:m?.[1].slice(0,1350),firstSlide:body.slice(body.indexOf('wwtt_content')-100,body.indexOf('wwtt_content')+1750),
   scripts:body.match(/<script[^>]*src="[^"]*radio[^"]*"/gi)?.slice(0,10)};
}
async function run([name,url,kind]){
 try{
 const ctl=new AbortController();const kill=setTimeout(()=>ctl.abort(),12000);
 const opts=kind==='html'?{'X-Respond-With':'html','X-Target-Selector':'.what_was_title .swiper-slide:first-child','X-Cache-Tolerance':'60'}:{};
 let response;
 try{response=await fetch(url,{headers:{Origin:'https://haniadaher21-ops.github.io',...opts},signal:ctl.signal});}finally{clearTimeout(kill);}
 const output={name,status:response.status,cors:response.headers.get('access-control-allow-origin')};
 const data=await response.text();
 if(kind==='root'){
   try{
     const obj=JSON.parse(data);
     output.size=data.length;output.routes=Object.keys(obj.routes??{}).filter(x=>/radio|track|cqct|now|titre|latest|live|station/.test(x)).slice(0,100);
     output.radioRoutes=Object.fromEntries(Object.entries(obj.routes??{}).filter(([k])=>k.includes('radio-tracks')).map(([k,v])=>[k,v.endpoints?.map(e=>({methods:e.methods,args:e.args?Object.keys(e.args):[]}))]));
   }catch(e){output.error=String(e).slice(0,120);}
 }else if(kind==='api'){
  try{const j=JSON.parse(data);output.count=Array.isArray(j)?j.length:undefined;output.first=JSON.stringify(j[0]??j).slice(0,480);}
  catch{output.snippet=data.slice(0,250);}
 }else if(kind==='wp'){
  try{const j=JSON.parse(data);output.keys=Object.keys(j);output.meta=JSON.stringify(j.meta??j.acf??j.radio??j.template??j.title??j._links).slice(0,1050);}
  catch{output.snippet=data.slice(0,200);}
 }else if(kind==='html'||kind==='page'){
  output.cover=sampleHtml(data);output.length=data.length;
  if(kind==='page'){
   const idHits=[...data.matchAll(/(?:radio[-_]?id|station[-_]?id|player[-_]id|tracklist|playlist|metadata\.infomaniak|radio-tracks\/v1)[^"'<>{}\s]{0,95}/gi)].slice(0,32).map(m=>data.slice(Math.max(0,m.index-40),m.index+100));
   output.hits=idHits;
  }
 }else output.snippet=data.slice(0,100);
 console.log('NOVA_DETAIL '+JSON.stringify(output));
 }catch(e){console.log('NOVA_DETAIL '+JSON.stringify({name,error:e.name+': '+String(e.message).slice(0,110)}))}
}
await Promise.all(cases.map(run));
