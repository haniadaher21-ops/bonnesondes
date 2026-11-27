// Optional, private scoring layer. No network, logging or persistence here.
const key = value => typeof value === 'string' ? value.normalize('NFKC').toLowerCase().trim().replace(/\s+/gu,' ') : '';
const bounded = value => typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.min(100,value)) : 0;
const mbid = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;

export function makeWeightedAffinity(profile) {
  const weights = new Map(), blocked = new Set((profile.excluded_artists ?? []).map(key).filter(Boolean));
  for (const row of profile.artists ?? []) {
    const k=key(row.artist);
    if(k && !blocked.has(k)) weights.set(k,Math.max(weights.get(k)??0,bounded(row.score)));
  }
  return {weights,blocked,known:new Set((profile.known_artist_names??[]).map(key).filter(Boolean))};
}

// The public metadata map is keyed by candidate artist, not private favorites.
// An ambiguous identity or missing evidence must contribute no indirect bonus.
export function weightedAffinity(names,index,metadata=new Map(),{tracklist=false}={}) {
  const artists = [...new Set(names.map(key).filter(Boolean))];
  if(artists.some(k=>index.blocked.has(k))) return {excluded:true,points:0,artists:artists.length,matches:0,related:0};
  let sum=0,matches=0,related=0,discoveries=0;
  const scores=[];
  for(const k of artists) {
    const direct=index.weights.get(k)??0;
    const entry=metadata.get(k);
    let indirect=0;
    if(entry?.status==='verified' && mbid.test(entry.mbid??'')) {
      for(const row of entry.neighbors??[]) {
        const name=key(row.artist);
        if(!name || !mbid.test(row.mbid??'') || row.mbid===entry.mbid || index.blocked.has(name)) continue;
        indirect=Math.max(indirect,0.55*(index.weights.get(name)??0));
      }
    }
    if(direct>0 && direct>=indirect) matches++;
    else if(indirect>0){related++;if(index.known.size&&!index.known.has(k))discoveries++;}
    const value=Math.max(direct,indirect);sum+=value;scores.push(value);
  }
  // Albums and lives use mean credit affinity. A long mix rewards up to three
  // distinct strong matches plus coverage, so a single favorite is useful but
  // cannot dominate. Unknown artists with no verified relation remain neutral.
  const mean=sum/Math.max(1,artists.length);
  const base=tracklist?0.08*scores.sort((a,b)=>b-a).slice(0,3).reduce((a,b)=>a+b,0)+0.06*mean:0.30*mean;
  const novelty=Math.min(3,discoveries*1.5);
  return {excluded:false,points:Math.round(Math.min(30,base+novelty)*100)/100,artists:artists.length,matches,related,discoveries};
}

// Supply only already-eligible baseline candidates with verified artist credits.
// Results are private; do not copy this return value into public edition JSON.
export function compareWeightedRanking(rows,index,metadata=new Map()) {
  const scored=rows.map(row=>{
    if(!Number.isFinite(row.score)) throw new Error('Invalid baseline score');
    const affinity=weightedAffinity(row.artists??[],index,metadata);
    return {id:row.id,baseline:row.score,score:row.score+affinity.points,affinity};
  });
  const sort=(a,b)=>b.score-a.score||String(a.id).localeCompare(String(b.id));
  return {before:scored.map(x=>({id:x.id,score:x.baseline})).sort(sort),
    after:scored.filter(x=>!x.affinity.excluded).sort(sort)};
}
