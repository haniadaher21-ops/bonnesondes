// Public-only diagnostic: no credentials, no browser profile, no data written.
const root='https://www.nova.fr/wp-json/';
async function probe(name,url) {
  try {
    const res=await fetch(url,{headers:{Origin:'https://haniadaher21-ops.github.io','User-Agent':'BonnesOndesMetadataCheck/1.0',...(name.startsWith('Nova Target')?{'X-Respond-With':'html','X-Cache-Tolerance':'60','X-Target-Selector':'.what_was_title .swiper-slide:first-child'}:name==='Nova HTML Reader'?{'X-Respond-With':'html','X-Cache-Tolerance':'60'}:{})},signal:AbortSignal.timeout(12000)});
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
    const mentions=[...body.matchAll(/quoi ce titre|tracklist|radio[-_]tracks|[0-2][0-9]:[0-5][0-9]/gi)].slice(0,20).map(m=>({index:m.index,text:body.slice(Math.max(0,m.index-80),m.index+280)}));
    const matchesHeadings=[...body.matchAll(/C['’]ÉTAIT QUOI CE TITRE/gi)];
    const offset=matchesHeadings.at(-1)?.index ?? 0;
    const excerpt=(name.startsWith('Nova Reader')||name.startsWith('Nova webpage')||name.startsWith('Nova Target')) ? (() => {
      const time=body.match(/(?:^|\\n)\\s*(?:[0-2]?[0-9]):[0-5][0-9]/m);
      const playing=body.search(/(?:Écouter la radio|C.{0,10}TAIT QUOI CE TITRE)/i);
      const point=time?.index ?? (playing>=0?playing:0);
      return {timeCount:[...body.matchAll(/(?:^|\\n)\\s*(?:[0-2]?[0-9]):[0-5][0-9]/gm)].length,playing,
        excerpt:body.slice(Math.max(0,point-250),point+1550)};
    })() : undefined;
    const matches=name.startsWith('Tuneping') && Array.isArray(json?.data)
      ? json.data.slice(0,50).map(({id,name,stream_url,metadata,homepage,station,artist,title,classification,confirmed_at})=>({id:id??station?.id,name:name??station?.name,stream_url,metadata,homepage,artist,title,classification,confirmed_at})):undefined;
    const routeKeys=name==='Nova routes' && json?.routes
      ? Object.keys(json.routes).filter(k=>['radio-tracks','cqct','/radios','/track'].some(fragment=>k.includes(fragment))) : undefined;
    console.log(JSON.stringify({name,status:res.status,allowOrigin:res.headers.get('access-control-allow-origin'),contentType:res.headers.get('content-type'),size:body.length,sample:name==='Nova routes'?undefined:sample(json),routeKeys,matches,excerpt,mentions:(name==='Nova webpage'||name==='Nova HTML Reader')?mentions:undefined}));
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
  ['Nova latest','https://www.nova.fr/wp-json/radio-tracks/v1/latests'],
  ['Nova latest main','https://www.nova.fr/wp-json/radio-tracks/v1/latests?radio=radio-nova'],
  ['Nova radio main','https://www.nova.fr/wp-json/radios/radio-nova'],
  ['Nova radio night','https://www.nova.fr/wp-json/radios/nova-lanuit'],
  ['Nova radio nouvo','https://www.nova.fr/wp-json/radios/nouvo-nova'],
  ['Nova radios all','https://www.nova.fr/wp-json/radios/all-radios'],
  ['Nova tracks','https://www.nova.fr/wp-json/track'],
  ['Nova webpage','https://www.nova.fr/radios/nouvo-nova/'],
  ['Nova Reader','https://r.jina.ai/https://www.nova.fr/radios/nouvo-nova/'],
  ['Nova HTML Reader','https://r.jina.ai/https://www.nova.fr/radios/nouvo-nova/'],
  ['Nova Target','https://r.jina.ai/https://www.nova.fr/radios/nouvo-nova/'],
  ['Nova Reader main','https://r.jina.ai/https://www.nova.fr/radios/radio-nova/'],
  ['Tuneping Radio Nova','https://api.tuneping.com/v1/stations?q=radio%20nova&country=FR&limit=50'],
  ['Tuneping Nouvo','https://api.tuneping.com/v1/stations?q=nouvo%20nova&country=FR&limit=50'],
  ['Tuneping Nova la nuit','https://api.tuneping.com/v1/stations?q=nova%20la%20nuit&country=FR&limit=50'],

].map(([name,url])=>probe(name,url)));
