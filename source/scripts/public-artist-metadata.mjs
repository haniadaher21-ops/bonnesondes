// Public metadata only. Never call with a private listening profile.
const key = value => typeof value==='string'?value.normalize('NFKC').toLowerCase().trim().replace(/\s+/gu,' '):'';
const mbid = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
export function resolveIdentity(name,data) {
  if(!Number.isInteger(data?.count)||data.count>100||!Array.isArray(data.artists))return null;
  const exact=data.artists.filter(a=>key(a.name)===key(name)&&mbid.test(a.id??''));
  return exact.length===1&&Number(exact[0].score)>=95?exact[0].id:null;
}
export function parseNeighbors(seed,data) {
  if(!data||typeof data!=='object'||Array.isArray(data)||data.error)throw new Error('Invalid ListenBrainz response');
  const results=new Map();
  for(const [id,rows] of Object.entries(data)){
    if(id===seed||!mbid.test(id)||!Array.isArray(rows))continue;
    const row=rows.find(r=>r.similar_artist_mbid===id&&key(r.similar_artist_name));
    if(row)results.set(id,{artist:row.similar_artist_name,mbid:id});
  }
  return [...results.values()].slice(0,10);
}
// Sequential requests, public names only, bounded per run. Pass public cache in
// memory; errors are not cached so future runs may retry.
export async function enrichPublicArtists(names,{fetcher=fetch,cache=new Map(),limit=20,pause=sleep}={}) {
  const unique=new Map(names.filter(x=>typeof x==='string'&&x.trim()&&x.length<=160).map(x=>[key(x),x]));
  let last=0;
  async function get(url) {
    await pause(Math.max(0,1100-(Date.now()-last)));last=Date.now();
    const res=await fetcher(url,{headers:{'User-Agent':'BonnesOndes/1.0 (https://github.com/haniadaher21-ops/bonnesondes)','Accept':'application/json'},signal:AbortSignal.timeout(12000)});
    if([429,503].includes(res.status)){const error=new Error('Provider temporarily limited');error.backoff=true;throw error;}
    if(!res.ok)throw new Error('Metadata request failed');
    return res.json();
  }
  const out=new Map();let calls=0;
  for(const [k,name] of unique){
    const saved=cache.get(k),age=Date.now()-Date.parse(saved?.checkedAt);
    if(saved?.status==='verified'&&Number.isFinite(age)&&age>=0&&age<30*86400000){out.set(k,saved);continue;}
    cache.delete(k);
    if(calls>=Math.max(0,Math.min(50,limit)))break;
    calls++;
    try{
      const query='artist:"'+name.replace(/\\/g,'\\\\').replace(/"/g,'\\"')+'"';
      const found=await get('https://musicbrainz.org/ws/2/artist/?'+new URLSearchParams({query,fmt:'json',limit:'100'}));
      const identity=resolveIdentity(name,found);
      if(!identity){out.set(k,{status:'ambiguous_or_missing'});continue;}
      const url='https://api.listenbrainz.org/1/lb-radio/artist/'+identity+'?'+new URLSearchParams({mode:'medium',max_similar_artists:'10',max_recordings_per_artist:'1',pop_begin:'0',pop_end:'100'});
      const result={status:'verified',mbid:identity,neighbors:parseNeighbors(identity,await get(url)),tags:(found.artists.find(a=>a.id===identity)?.tags??[]).filter(t=>typeof t.name==='string'&&Number(t.count)>0).sort((a,b)=>b.count-a.count).slice(0,12).map(t=>t.name),sourceUrl:url,checkedAt:new Date().toISOString()};
      out.set(k,result);cache.set(k,result);
    }catch(error){out.set(k,{status:'unavailable'});if(error?.backoff)break;}
  }
  return out;
}
