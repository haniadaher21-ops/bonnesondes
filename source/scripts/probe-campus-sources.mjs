const urls=[
  ['wxyc-flowsheet','https://api.wxyc.org/flowsheet?limit=30'],
  ['wxyc-flowsheet-jina','https://r.jina.ai/https://api.wxyc.org/flowsheet?limit=30'],
  ['wfmu-widget','https://wfmu.org/now-playing-widget.html'],
  ['wfmu-scripts','https://wfmu.org/js/now-playing-widget.js'],
  ['wfmu-scripts2','https://wfmu.org/js/now-playing.js'],
  ['kcrw-api','https://tracklist-api.kcrw.com/Music/all/1'],
];
await Promise.all(urls.map(async ([name,url])=>{
try{
const res=await fetch(url,{signal:AbortSignal.timeout(12000),headers:{Origin:'https://haniadaher21-ops.github.io','X-Cache-Tolerance':'0'}});
const content=await res.text();let details={};
if(name.includes('wxyc')) {
 try{const p=JSON.parse(content);details={type:Array.isArray(p)?'array':typeof p,fields:Object.keys(p).slice(0,20),entries:(p.entries??[]).slice(0,5),
 on_air:p.on_air,total:p.total}}catch{details={start:content.slice(0,1900)}}
}else if(name==='wfmu-widget') {
 details={scripts:[...content.matchAll(/<script[^>]+src=["']([^"']+)/g)].map(m=>m[1]),
 ajax:[...content.matchAll(/(?:fetch|https?:\/\/|ajax|\.json|api\/)[^\n]{0,170}/gi)].slice(0,18).map(m=>m[0]),
 tail:content.slice(-5000)};
}else if(name.startsWith('wfmu-scripts')){
 details={start:content.slice(0,7000)}
}else {
 try {const x=JSON.parse(content);details={total:x.length,top:x.slice(0,2).map(y=>({time:y.datetime,artist:y.artist,title:y.title,albumImage:y.albumImage}))}}catch{}
}
console.log('RADIO_DEEP '+JSON.stringify({name,status:res.status,cors:res.headers.get('access-control-allow-origin'),url:res.url,details}).slice(0,18000));
}catch(e){console.log('RADIO_DEEP '+JSON.stringify({name,error:String(e)}))}
}));
