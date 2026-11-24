const urls=[
 ['wfmu-one','https://r.jina.ai/https://wfmu.org/currentliveshows_aggregator.php?ch=1'],
 ['wfmu-all','https://r.jina.ai/https://wfmu.org/currentliveshows_aggregator.php?ch=1,4,6,8'],
 ['wfmu-direct','https://wfmu.org/currentliveshows_aggregator.php?ch=1'],
];
await Promise.all(urls.map(async ([name,url])=> {
 try {
  const r=await fetch(url,{signal:AbortSignal.timeout(14000),headers:{Origin:'https://haniadaher21-ops.github.io','X-Cache-Tolerance':'0','X-Respond-With':'markdown'}});
  const s=await r.text();
  console.log('WFMU_SINGLE '+JSON.stringify({name,status:r.status,cors:r.headers.get('access-control-allow-origin'),length:s.length,sample:s.replace(/\s+/g,' ').slice(0,3400)}));
 } catch(e){console.log('WFMU_SINGLE '+JSON.stringify({name,error:String(e)}))}
}));
