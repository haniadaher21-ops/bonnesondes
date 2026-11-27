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
// Public cache contains completed relations, resolved identities and short-lived
// negative lookups. Each provider has an independent, persistent cooldown.
const DAY=86400000;
const transient=new Set([429,500,502,503,504]);
const ttl={verified:30*DAY,identity:30*DAY,ambiguous_or_missing:7*DAY};
const numHeader=(res,name)=>{
  const raw=res.headers?.get?.(name);
  return raw!==null&&raw!==undefined&&raw!==''&&Number.isFinite(Number(raw))?Number(raw):null;
};
function retryDelay(res,now){
  const seconds=numHeader(res,'retry-after');
  const date=seconds===null?Date.parse(res.headers?.get?.('retry-after')??''):NaN;
  const reset=numHeader(res,'x-ratelimit-reset-in');
  return Math.max(0,seconds===null?0:1000*seconds,Number.isFinite(date)?date-now:0,
    reset===null?0:1000*reset);
}
export async function enrichPublicArtists(names,{
  fetcher=fetch,cache=new Map(),backoff={},limit=20,pause=sleep,clock=Date.now,
  diagnostics={}
}={}) {
  const unique=new Map(names.filter(x=>typeof x==='string'&&x.trim()&&x.length<=160).map(x=>[key(x),x]));
  const next=new Map();
  const out=new Map();
  const budget=Math.max(0,Math.min(50,limit));
  let calls=0;
  Object.assign(diagnostics,{requests:0,retries:0,cacheHits:0,deferred:0,stale:0,providers:{}});
  function hold(host,until){
    backoff[host]=new Date(Math.max(Date.parse(backoff[host])||0,until)).toISOString();
  }
  function fail(host,status,delay=0){
    hold(host,clock()+Math.max(15*60000,delay));
    diagnostics.providers[host]=status;
  }
  async function get(url){
    const host=new URL(url).hostname;
    for(let attempt=0;attempt<2;attempt++){
      const until=Date.parse(backoff[host]);
      if(until>clock()){diagnostics.providers[host]='cooldown';return null;}
      await pause(Math.max(0,(next.get(host)??0)-clock()));
      next.set(host,clock()+2500);
      let res;
      try{
        diagnostics.requests++;
        res=await fetcher(url,{headers:{'User-Agent':'BonnesOndes/1.1 (https://github.com/haniadaher21-ops/bonnesondes/issues)','Accept':'application/json'},signal:AbortSignal.timeout(12000),redirect:'error'});
      }catch{
        if(attempt===0){diagnostics.retries++;await pause(5000);continue;}
        fail(host,'network-error');return null;
      }
      const delay=retryDelay(res,clock());
      if(res.ok){
        diagnostics.providers[host]='ok';
        if(numHeader(res,'x-ratelimit-remaining')===0&&delay>0)hold(host,clock()+delay);
        try{return await res.json();}catch{fail(host,'invalid-response');return null;}
      }
      if(transient.has(res.status)){
        // Respect explicit Retry-After; long waits are deferred to a later run.
        await res.body?.cancel?.().catch(()=>{});
        const wait=Math.max(5000,delay);
        if(attempt===0&&wait<=10000){diagnostics.retries++;await pause(wait);continue;}
        fail(host,'http-'+res.status,delay);return null;
      }
      diagnostics.providers[host]='http-'+res.status;
      await res.body?.cancel?.().catch(()=>{});
      return null;
    }
    return null;
  }
  for(const [k,name] of unique){
    const saved=cache.get(k),age=clock()-Date.parse(saved?.checkedAt);
    const fresh=Number.isFinite(age)&&age>=0&&age<(ttl[saved?.status]??0);
    if(fresh&&['verified','ambiguous_or_missing'].includes(saved.status)){
      out.set(k,saved);diagnostics.cacheHits++;continue;
    }
    // Even when the budget is used up or one provider is down, continue scanning
    // the entire queue for valid cached entries. Retain stale verified data for
    // at most 90 days while refreshing, never invent a relation.
    const stale=saved?.status==='verified'&&Number.isFinite(age)&&age>=0&&age<90*DAY;
    const fallback=()=>{
      if(stale){out.set(k,saved);diagnostics.stale++;}
      else if(saved?.status==='identity'&&fresh)out.set(k,saved);
      else out.set(k,{status:'unavailable'});
    };
    if(calls>=budget){diagnostics.deferred++;fallback();continue;}
    const cachedIdentity=(fresh||stale)&&mbid.test(saved?.mbid??'')?saved:null;
    const mb='musicbrainz.org',lb='api.listenbrainz.org';
    if((!cachedIdentity&&Date.parse(backoff[mb])>clock())||Date.parse(backoff[lb])>clock()){
      diagnostics.deferred++;fallback();continue;
    }
    calls++;
    let identity=cachedIdentity;
    if(!identity){
      const query='artist:"'+name.replace(/\\/g,'\\\\').replace(/"/g,'\\"')+'"';
      const found=await get('https://musicbrainz.org/ws/2/artist/?'+new URLSearchParams({query,fmt:'json',limit:'100'}));
      if(!found){fallback();continue;}
      // Invalid responses are outages, not verified negative results.
      if(!Number.isInteger(found.count)||!Array.isArray(found.artists)){fallback();continue;}
      const id=resolveIdentity(name,found);
      if(!id){
        const result={status:'ambiguous_or_missing',checkedAt:new Date(clock()).toISOString()};
        out.set(k,result);cache.delete(k);cache.set(k,result);continue;
      }
      identity={status:'identity',mbid:id,tags:(found.artists.find(a=>a.id===id)?.tags??[]).filter(t=>typeof t.name==='string'&&Number(t.count)>0).sort((a,b)=>b.count-a.count).slice(0,12).map(t=>t.name),checkedAt:new Date(clock()).toISOString()};
      cache.delete(k);cache.set(k,identity);
    }
    const url='https://api.listenbrainz.org/1/lb-radio/artist/'+identity.mbid+'?'+new URLSearchParams({mode:'medium',max_similar_artists:'10',max_recordings_per_artist:'1',pop_begin:'0',pop_end:'100'});
    const data=await get(url);
    try{
      if(!data)throw Error('Missing relationships');
      const result={status:'verified',mbid:identity.mbid,neighbors:parseNeighbors(identity.mbid,data),tags:identity.tags??[],sourceUrl:url,checkedAt:new Date(clock()).toISOString()};
      out.set(k,result);cache.delete(k);cache.set(k,result);
    }catch{
      if(stale){out.set(k,saved);diagnostics.stale++;}
      else out.set(k,identity);
    }
  }
  return out;
}
