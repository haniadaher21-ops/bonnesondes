// Public-only diagnostic: no credentials, no browser profile, no data written.
const root='https://www.nova.fr/wp-json/';
async function probe(name,url) {
  try {
    const res=await fetch(url,{headers:{Origin:'https://haniadaher21-ops.github.io','User-Agent':'BonnesOndesMetadataCheck/1.0'},signal:AbortSignal.timeout(12000)});
    const body=await res.text();
    let json;
    try {json=JSON.parse(body)}catch{}
    const sample = (value,depth=0) => {
      if(depth>2)return typeof value;
      if(Array.isArray(value))return {arrayLength:value.length,first:sample(value[0],depth+1)};
      if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).slice(0,12).map(([k,v])=>[k,sample(v,depth+1)]));
      if(typeof value==='string')return value.slice(0,80);
      return value;
    };
    const routeKeys=name==='Nova routes' && json?.routes
      ? Object.keys(json.routes).filter(k=>/radio-tracks|cqct|^\\/radios|^\\/track/.test(k)) : undefined;
    console.log(JSON.stringify({name,status:res.status,allowOrigin:res.headers.get('access-control-allow-origin'),contentType:res.headers.get('content-type'),size:body.length,sample:name==='Nova routes'?undefined:sample(json),routeKeys}));
  }catch(e){console.log(JSON.stringify({name,error:e.name||'FetchError',message:e.message?.slice(0,140)}));}
}
await probe('Nova routes',root);
await Promise.all([
  ['FIP Jazz','https://api.radiofrance.fr/livemeta/pull/65'],
  ['FIP Groove','https://api.radiofrance.fr/livemeta/pull/66'],
  ['FIP Electro','https://api.radiofrance.fr/livemeta/pull/74'],
  ['FIP Rock','https://api.radiofrance.fr/livemeta/pull/64'],
  ['Nova main','https://www.nova.fr/wp-json/mobile-app/v1/cqct/radio-nova'],
  ['Nova Night','https://www.nova.fr/wp-json/mobile-app/v1/cqct/nova-lanuit'],
  ['Nouvo Nova','https://www.nova.fr/wp-json/mobile-app/v1/cqct/nouvo-nova'],
].map(([name,url])=>probe(name,url)));
