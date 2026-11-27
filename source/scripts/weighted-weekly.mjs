import {emptyTasteProfile} from '../editorial/taste-profile.mjs';
import {weeklyShortlist,candidateArtistCredits} from './weekly-ranking.mjs';
import {enrichPublicArtists} from './public-artist-metadata.mjs';
import {musicalTags} from './style-affinity.mjs';
import {bandcampAlbum} from './bandcamp-albums.mjs';
import {readPublicPage} from './album-catalogues.mjs';
import styleSources from '../editorial/artist-style-sources.json' with {type:'json'};
const artistKey=name=>String(name??'').normalize('NFKC').toLowerCase().trim().replace(/\s+/gu,' ');

// Explicitly pass public, independently collected candidates. Round-robin
// across candidates so one long tracklist cannot consume the lookup budget.
export function publicArtistQueue(rows,now){
  const groups=['Album','Live session','Radio show'].map(format=>rows.filter(({item})=>item.format===format));
  const ordered=[];
  for(let i=0;i<Math.max(0,...groups.map(g=>g.length));i++)for(const g of groups)if(g[i])ordered.push(g[i]);
  const lists=ordered.map(({item})=>candidateArtistCredits(item,now));
  const result=[],seen=new Set();
  for(let i=0;i<Math.max(0,...lists.map(a=>a.length));i++){
    for(const list of lists){
      const name=list[i],key=name?.normalize('NFKC').toLowerCase().trim().replace(/\s+/gu,' ');
      if(key&&!seen.has(key)){seen.add(key);result.push(name);}
    }
  }
  return result;
}
// Use public, verified release genre evidence even when MusicBrainz is down.
// An artist's album styles are a weaker live proxy, never proof of similarity.
export async function mergePublicStyleEvidence(metadata,publicCandidates,{fetcher=fetch,cache=new Map(),now=new Date(),references=styleSources}={}){
  const artists=new Set(publicCandidates.filter(x=>x.format==='Live session').map(x=>artistKey(x.creator)));
  const add=(name,tags,url)=>{
    const k=artistKey(name),valid=musicalTags(tags);
    if(!artists.has(k)||!valid.length)return;
    const old=metadata.get(k)??{};
    metadata.set(k,{...old,status:old.status==='verified'?'verified':old.status==='identity'?'identity':'public-style',tags:[...new Set([...(old.tags??[]),...valid])],styleSourceUrl:url});
  };
  for(const item of publicCandidates)if(item.format==='Album'&&item.verificationStatus==='primary-verified')add(item.creator,item.tags,item.sourceUrl);
  for(const ref of references){
    const k=artistKey(ref.artist);
    if(!artists.has(k)||musicalTags(metadata.get(k)?.tags).length)continue;
    const url=new URL(ref.url);
    if(url.protocol!=='https:'||url.port||!/^[-a-z0-9]+\.bandcamp\.com$/.test(url.hostname)||!/^\/album\/[^/]+$/.test(url.pathname))continue;
    const cacheKey='public-style:'+k,saved=cache.get(cacheKey);
    const age=+now-Date.parse(saved?.checkedAt);
    if(saved?.sourceUrl===ref.url&&age>=0&&age<30*86400000){add(ref.artist,saved.tags,ref.url);continue;}
    try{
      const primary=bandcampAlbum(await readPublicPage(ref.url,fetcher),ref.url,'Artist catalogue');
      if(!primary||artistKey(primary.creator)!==k)continue;
      const tags=musicalTags(primary.tags);
      if(tags.length){cache.set(cacheKey,{status:'public-style',tags,sourceUrl:ref.url,checkedAt:now.toISOString()});add(ref.artist,tags,ref.url);}
    }catch{/* No source, no evidence. */}
  }
  return metadata;
}
export async function refreshPublicMetadata({options,publicCandidates,cache=new Map(),backoff={},fetcher=fetch,limit=20,styleLimit=8,pause}){
  if(!Array.isArray(publicCandidates))throw Error('Corpus public invalide.');
  const now=options.now??new Date();
  const neutral=weeklyShortlist({...options,candidates:publicCandidates,profile:emptyTasteProfile(),weightedProfile:undefined,weightedWeight:0,now});
  const diagnostics={};
  const metadata=await enrichPublicArtists(publicArtistQueue(neutral.rankings,now),{cache,backoff,fetcher,limit,styleLimit,diagnostics,...(pause&&{pause})});
  await mergePublicStyleEvidence(metadata,publicCandidates,{fetcher,cache,now});
  return {metadata,coverage:{publicStyleArtists:[...metadata.values()].filter(x=>x.styleSourceUrl).length,eligible:neutral.rankings.length,lookups:metadata.size,verified:[...metadata.values()].filter(x=>x.status==='verified').length,related:[...metadata.values()].filter(x=>x.neighbors?.length).length,...diagnostics}};
}
export async function compareWeeklyWeighted({options,weightedProfile,publicCandidates,cache=new Map(),backoff={},fetcher=fetch,limit=20,styleLimit=8,pause}){
  if(!weightedProfile||!Array.isArray(weightedProfile.artists)||!Array.isArray(publicCandidates))throw Error('Profil ou corpus public invalide.');
  const now=options.now??new Date();
  // Public eligibility and lookup order do not depend on either private profile.
  const {metadata,coverage}=await refreshPublicMetadata({options,publicCandidates,cache,backoff,fetcher,limit,styleLimit,pause});
  const before=weeklyShortlist({...options,now,weightedWeight:0});
  const after=weeklyShortlist({...options,now,weightedProfile,artistMetadata:metadata,weightedWeight:1});
  return {before,after,coverage};
}
