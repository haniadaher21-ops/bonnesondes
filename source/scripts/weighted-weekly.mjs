import {emptyTasteProfile} from '../editorial/taste-profile.mjs';
import {weeklyShortlist,candidateArtistCredits} from './weekly-ranking.mjs';
import {enrichPublicArtists} from './public-artist-metadata.mjs';

// Explicitly pass public, independently collected candidates. Round-robin
// across candidates so one long tracklist cannot consume the lookup budget.
export function publicArtistQueue(rows,now){
  const lists=rows.map(({item})=>candidateArtistCredits(item,now));
  const result=[],seen=new Set();
  for(let i=0;i<Math.max(0,...lists.map(a=>a.length));i++){
    for(const list of lists){
      const name=list[i],key=name?.normalize('NFKC').toLowerCase().trim().replace(/\s+/gu,' ');
      if(key&&!seen.has(key)){seen.add(key);result.push(name);}
    }
  }
  return result;
}
export async function refreshPublicMetadata({options,publicCandidates,cache=new Map(),backoff={},fetcher=fetch,limit=20,pause}){
  if(!Array.isArray(publicCandidates))throw Error('Corpus public invalide.');
  const now=options.now??new Date();
  const neutral=weeklyShortlist({...options,candidates:publicCandidates,profile:emptyTasteProfile(),weightedProfile:undefined,weightedWeight:0,now});
  const diagnostics={};
  const metadata=await enrichPublicArtists(publicArtistQueue(neutral.rankings,now),{cache,backoff,fetcher,limit,diagnostics,...(pause&&{pause})});
  return {metadata,coverage:{eligible:neutral.rankings.length,lookups:metadata.size,verified:[...metadata.values()].filter(x=>x.status==='verified').length,related:[...metadata.values()].filter(x=>x.neighbors?.length).length,...diagnostics}};
}
export async function compareWeeklyWeighted({options,weightedProfile,publicCandidates,cache=new Map(),backoff={},fetcher=fetch,limit=20,pause}){
  if(!weightedProfile||!Array.isArray(weightedProfile.artists)||!Array.isArray(publicCandidates))throw Error('Profil ou corpus public invalide.');
  const now=options.now??new Date();
  // Public eligibility and lookup order do not depend on either private profile.
  const {metadata,coverage}=await refreshPublicMetadata({options,publicCandidates,cache,backoff,fetcher,limit,pause});
  const before=weeklyShortlist({...options,now,weightedWeight:0});
  const after=weeklyShortlist({...options,now,weightedProfile,artistMetadata:metadata,weightedWeight:1});
  return {before,after,coverage};
}
