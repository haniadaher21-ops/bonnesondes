for(const [name,url] of [
 ['wfmu-aggregator','https://wfmu.org/currentliveshows_aggregator.php?ch=1,4,6,8&_=1795520000000'],
 ['wfmu-jina','https://r.jina.ai/https://wfmu.org/currentliveshows_aggregator.php?ch=1,4,6,8'],
 ['wxyc-reader','https://r.jina.ai/https://api.wxyc.org/flowsheet?limit=30']
]){
 try{
 const r=await fetch(url,{signal:AbortSignal.timeout(13000),headers:{Origin:'https://haniadaher21-ops.github.io','X-Cache-Tolerance':'0'}});
 const s=await r.text();
 const blocks=s.match(/<div[^>]+(?:bigline|smallline|streamtitle)[^>]*>[^<]*<\/div>/gi)??[];
 const summary=s.replace(/\s+/g,' ').slice(0,2800);
 console.log('WFMU_FINAL_PROBE '+JSON.stringify({name,status:r.status,cors:r.headers.get('access-control-allow-origin'),length:s.length,blocks:blocks.slice(0,30),summary}));
 }catch(e){console.log('WFMU_FINAL_PROBE '+JSON.stringify({name,error:String(e)}))}
}
