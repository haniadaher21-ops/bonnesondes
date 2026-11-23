import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { readRunnerProfile } from '../private-sync/client.mjs';
import { normalizeTasteProfile, emptyTasteProfile } from '../editorial/taste-profile.mjs';
import { canonicalUrl } from '../editorial/edition.mjs';
import { editionForCycle } from './automation-policy.mjs';
import { legacyEdition, legacyItems, publishedFile, readJson } from './editorial-files.mjs';
import { weeklyShortlist } from './weekly-ranking.mjs';

if (process.env.AUTO_PUBLISH_ENABLED !== 'false') throw new Error('Audit uniquement non publiant');
const directory=process.env.BONNES_ONDES_AUDIT_DIR;
if (!directory) throw new Error('Dossier rapport manquant');
const remote=await readRunnerProfile({
  url:process.env.SUPABASE_URL,publicKey:process.env.SUPABASE_PUBLISHABLE_KEY,
},process.env.BONNES_ONDES_RUNNER_TOKEN);
const profile=normalizeTasteProfile(remote.profile);
if (!Array.isArray(remote.state?.candidates)) throw new Error('Index privé indisponible');
const now=new Date(), startsOn=editionForCycle(now);
const earlier=[legacyEdition,...readJson(publishedFile).filter(edition=>edition.startsOn!==startsOn)];
const candidates=remote.state.candidates;
const seen=Object.fromEntries(candidates.map(item=>[canonicalUrl(item.url),item.firstSeenAt]));
const run=p=>weeklyShortlist({candidates,profile:p,earlier,catalog:legacyItems,startsOn,now,seen});
const personalized=run(profile),neutral=run(emptyTasteProfile());
const owner=personalized.rankings.filter(row=>row.item.format==='Album');
const neutralAlbum=neutral.rankings.filter(row=>row.item.format==='Album');
const contrast=emptyTasteProfile();
if(neutralAlbum.length)contrast.favoriteArtists=[neutralAlbum.at(-1).item.creator];
const synthetic=run(contrast).rankings.filter(row=>row.item.format==='Album');
const neutralMap=new Map(neutralAlbum.map((row,i)=>[canonicalUrl(row.item.url),i+1]));
const syntheticMap=new Map(synthetic.map((row,i)=>[canonicalUrl(row.item.url),i+1]));
const top=owner.slice(0,10).map((row,i)=>({
  rank:i+1,artist:row.item.creator,title:row.item.title,genre:row.item.genre,
  date:row.item.releaseDate,source:row.item.source,sourceUrl:row.item.sourceUrl,
  releaseProofUrl:row.item.releaseProofUrl,editorialSource:row.item.editorialSource,
  editorialUrl:row.item.editorialUrl,editorialClaim:row.item.editorialClaim,
  spotifyUrl:row.item.url,score:row.score,signals:row.signals,
  neutralRank:neutralMap.get(canonicalUrl(row.item.url)),
  syntheticRank:syntheticMap.get(canonicalUrl(row.item.url)),
}));
const report={
  generatedAt:now.toISOString(),startsOn,mode:'snapshot-only',profileRevision:remote.revision,
  indexCandidates:candidates.length,albumCandidates:candidates.filter(row=>row.format==='Album').length,
  qualified:owner.length,missing:Math.max(0,10-owner.length),
  profileHasSignals:personalized.personalized,
  preferenceCounts:{
    favoriteArtists:profile.favoriteArtists.length,explore:profile.explore.length,
    favoritePublications:profile.favoritePublications.length,
    feedback:profile.signals.items.length,
  },
  albums:top,
  rejectedAlbumReasons:personalized.rejected.filter(row=>row.format==='Album').map(row=>({title:row.title,reason:row.reason})),
  caveat:'Instant replay from existing private index; stale or missing source proofs are not refreshed. Full source audit runs separately.',
  published:false,privateStateWritten:false,
};
await mkdir(directory,{recursive:true});
await writeFile(join(directory,'index-audit.json'),JSON.stringify(report,null,2)+'\n',{mode:0o600});
const safe=x=>String(x??'').replace(/[\n\r|<>]/g,' ').trim();
const lines=[
  '# Audit immédiat de l’index privé (sans nouvelle collecte)',
  'Profil synchronisé, révision '+remote.revision+'. Candidats : '+candidates.length+'. Albums admissibles : '+owner.length+'/10.',
  'Attention : le test utilise les preuves en cache, pas une vérification nouvelle des liens.',
  '| Rang | Artiste | Album | Source presse | Score | Rang neutre | Rang fictif |',
  '|---:|---|---|---|---:|---:|---:|',
  ...top.map(row=>'| '+row.rank+' | '+safe(row.artist)+' | '+safe(row.title)+' | '+safe(row.editorialSource)
    +' | '+row.score+' | '+(row.neutralRank??'—')+' | '+(row.syntheticRank??'—')+' |'),
  '## Liens et raisons',
  ...top.map(row=>'- '+safe(row.artist)+' — '+safe(row.title)+': '+safe(row.sourceUrl)
    +' ; '+safe(row.editorialUrl)+' ; '+row.signals.map(safe).join(', ')),
  '## Exclusions',
  ...report.rejectedAlbumReasons.map(row=>'- '+safe(row.title)+': '+safe(row.reason)),
];
await writeFile(join(directory,'index-audit.md'),lines.join('\n\n')+'\n',{mode:0o600});
console.log('INDEX_AUDIT_RESULT',JSON.stringify({
  status:'ok',indexCandidates:candidates.length,albumCandidates:report.albumCandidates,
  qualified:owner.length,missing:report.missing,profileHasSignals:report.profileHasSignals,
  preferenceCounts:report.preferenceCounts,
  changesVsNeutral:top.filter(row=>row.neutralRank!==row.rank).length,
  titles:top.map(row=>row.artist+' — '+row.title),
}));
