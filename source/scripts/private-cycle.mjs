import { createHash } from 'node:crypto';
import { constants, cpSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { canonicalUrl, editionItems, parisDate } from '../editorial/edition.mjs';
import { emptyTasteProfile, normalizeTasteProfile } from '../editorial/taste-profile.mjs';
import { readRunnerProfile, syncRpc } from '../private-sync/client.mjs';
import { collectAlbumCatalogues, readPublicPage } from './album-catalogues.mjs';
import { collectYouTubeMixes } from './youtube-mixes.mjs';
import { collectEditorialEndorsements } from './editorial-endorsements.mjs';
import { collectMusicPress, matchMusicPress } from './music-press.mjs';
import { discover } from './discovery.mjs';
import { legacyEdition, legacyItems, publishedFile, readJson } from './editorial-files.mjs';
import {filterConflictingDates} from './release-metadata.mjs';
import { verifyAlbums, verifyLives, normalized } from './weekly-evidence.mjs';
import { weeklyShortlist } from './weekly-ranking.mjs';
import { editorialEndorsement } from './recommendation-policy.mjs';
import {publicProviderFetcher} from './provider-policy.mjs';
import {observationReport,renderObservation} from './observation-report.mjs';
import { editionForCycle, publicationDecision, publicEdition, rollCandidates } from './automation-policy.mjs';

const root = fileURLToPath(new URL('../',import.meta.url));

export async function privateCycle({mode = 'observe', env = process.env, now = new Date(), fetcher = fetch, providerWait} = {}) {
  if (!['collect','observe','publish'].includes(mode)) throw new Error('Mode inconnu.');
  const config = {url:env.SUPABASE_URL ?? '',publicKey:env.SUPABASE_PUBLISHABLE_KEY ?? ''};
  if (!env.BONNES_ONDES_RUNNER_TOKEN) throw new Error('Accès privé non configuré.');
  const remote = await readRunnerProfile(config,env.BONNES_ONDES_RUNNER_TOKEN,fetcher);
  const profile = normalizeTasteProfile(remote.profile);
  const state = remote.state;
  state.providerBackoff ??= {};
  fetcher=publicProviderFetcher(fetcher,{now,backoff:state.providerBackoff,wait:providerWait});
  if (state?.version !== 1 || !Array.isArray(state.candidates) || !Array.isArray(state.dryRuns)) throw new Error('Index privé invalide.');
  const editions = readJson(publishedFile);
  const earlier = [legacyEdition,...editions];
  const startsOn = editionForCycle(now);
  const already = editions.find(edition => edition.startsOn === startsOn);
  if (mode === 'publish' && already) return {status:'noop',reason:'Édition déjà enregistrée'};
  const sources = readJson(new URL('../editorial/sources.json',import.meta.url));
  const known = [...legacyItems,...earlier.flatMap(editionItems)];
  const catalogueConfig=readJson(new URL('../editorial/album-catalogues.json',import.meta.url));
  const catalogueFingerprint=createHash('sha256').update(JSON.stringify(catalogueConfig)+await readFile(new URL('./bandcamp-albums.mjs',import.meta.url),'utf8')+await readFile(new URL('./album-catalogues.mjs',import.meta.url),'utf8')+await readFile(new URL('./label-news.mjs',import.meta.url),'utf8')).digest('hex');
  const snapshot=state.albumCatalogueSnapshot;
  const cached=snapshot?.fingerprint===catalogueFingerprint && snapshot?.startsOn===startsOn
    && Number.isFinite(Date.parse(snapshot.at)) && now.getTime()-Date.parse(snapshot.at)>=0
    && now.getTime()-Date.parse(snapshot.at)<(snapshot.status.some(row=>!['ok','empty'].includes(row.status))?3600000:6*3600000) && Array.isArray(snapshot.records) && Array.isArray(snapshot.status)
;
  const [collection,catalogues,endorsements,press] = await Promise.all([
    discover({sources,profile,existing:known,now,fetcher}),
    cached ? Promise.resolve({records:snapshot.records,status:snapshot.status.map(row=>({...row,cachedAt:snapshot.at}))})
      : collectAlbumCatalogues({startsOn,today:parisDate(now),fetcher,catalogues:catalogueConfig}),
    collectEditorialEndorsements({fetcher}),
    collectMusicPress(readJson(new URL('../editorial/music-press.json',import.meta.url)),{fetcher,today:parisDate(now)}),
  ]);
  const date = now.toISOString();
  if(!cached)state.albumCatalogueSnapshot={at:date,startsOn,fingerprint:catalogueFingerprint,
    records:catalogues.records.map(({evidenceHtml,...record})=>record),status:catalogues.status};
  // Older, personally relevant official performances compete with recent uploads.
  // They still need independent YouTube Data API verification on every observation.
  const archivalLives=readJson(new URL('../editorial/live-archive.json',import.meta.url))
    .filter(item=>item.date<=parisDate(now) && sources.some(source=>source.id===item.sourceId))
    .map(item=>({...item,collectedAt:date,verificationStatus:'source-verified'}));
  const youtubeMixes=mode==='collect' ? {items:[],status:'deferred-until-observation'}
    : await collectYouTubeMixes({startsOn,today:parisDate(now),profile,key:env.YOUTUBE_DATA_API_KEY,fetcher});
  const youtubeMixSummary={status:youtubeMixes.status,found:youtubeMixes.found??0,
    eligible:youtubeMixes.items.length,queries:youtubeMixes.queries??0,
    publicCandidates:youtubeMixes.items.slice(0,12).map(({title,source,date,url})=>({title,source,date,url}))};
  if(mode!=='collect') console.log('YouTube mix discovery',JSON.stringify(youtubeMixSummary));
  const newlyDiscoveredYouTubeMixes=youtubeMixes.items.map(item=>({...item,collectedAt:date}));
  const previous = rollCandidates(state.candidates,[...collection.candidates,...archivalLives,...newlyDiscoveredYouTubeMixes],now);
  const registered = readJson(new URL('../editorial/album-sources.json',import.meta.url));
  const linked = previous.filter(item => item.format === 'Album' && item.creator && item.editorialKind)
    .flatMap(item => [
      ...(item.primaryReleaseUrls ?? []).map(sourceUrl => ({
        title:item.title,creator:item.creator,label:new URL(sourceUrl).hostname,sourceUrl,
        editorialSource:item.editorialSource,editorialUrl:item.editorialUrl,
        editorialKind:item.editorialKind,editorialClaim:item.editorialClaim,
      })),
      ...(item.editorialKind==='curator-pick' ? (item.bandcampUrls ?? []).map(sourceUrl => ({
        title:item.title,creator:item.creator,label:'Bandcamp Notes',sourceUrl,
        method:'bandcamp-album',editorialSource:item.editorialSource,editorialUrl:item.editorialUrl,
        editorialKind:item.editorialKind,editorialClaim:item.editorialClaim,
      })) : []),
    ]).slice(0,45);
  const priorAlbums=previous.filter(item=>item.format==='Album' && item.releaseProofUrl).map(item=>({
    title:item.title,creator:item.creator,label:item.source,sourceUrl:item.sourceUrl,url:item.url,listeningMappingUrl:item.listeningMappingUrl,
    method:item.sourceUrl.includes('.bandcamp.com/')?'bandcamp-album':undefined,
    editorialSource:item.editorialSource,editorialUrl:item.editorialUrl,
    editorialKind:item.editorialKind,editorialClaim:item.editorialClaim,
  }));
  const bySource=new Map();
  for(const record of [...priorAlbums,...registered,...catalogues.records,...linked,...press.records,...endorsements.records]) {
    bySource.set(record.sourceUrl,{...(bySource.get(record.sourceUrl)??{}),
      ...Object.fromEntries(Object.entries(record).filter(([,value])=>value!==undefined))});
  }
  const uniqueRecords=[...bySource.values()];
  // A media mention is only a lead until independent release and Spotify
  // identity have been verified against the primary source.
  for(const record of uniqueRecords) {
    const mention=matchMusicPress(record,press.mentions);
    const priority=x=>x?.editorialClaim==='Album of the Week'?3
      : x?.editorialClaim==='Best New Music'?3
      : x?.editorialClaim==='Album of the Day'?3
      : x?.editorialKind?1:0;
    if(mention && priority(mention)>priority(record)) Object.assign(record,mention);
  }
  const preferredSources=[...profile.favoritePublications,...profile.favoriteRadios,...profile.spotify.map(row=>row.name).filter(Boolean)].map(normalized);
  const preferredArtists=profile.favoriteArtists.map(normalized);
  const priority=record=>38*Number(preferredArtists.includes(normalized(record.creator)))
    +8*Number(preferredSources.includes(normalized(record.label)))
    +60*Number(preferredSources.includes(normalized(record.editorialSource)))
    +90*Number(record.editorialKind==='critic-pick')+70*Number(record.editorialKind==='curator-pick')
    +22*Number((record.tags??[]).some(tag=>profile.explore.map(normalized).includes(normalized(tag))));
  uniqueRecords.sort((a,b)=>priority(b)-priority(a)||a.sourceUrl.localeCompare(b.sourceUrl));
  for(const record of uniqueRecords) {
    const prior=previous.find(item=>item.releaseProofUrl && (item.sourceUrl===record.sourceUrl || (record.releaseDate && item.releaseDate===record.releaseDate))
      && normalized(item.creator)===normalized(record.creator) && normalized(item.title)===normalized(record.title));
    if(prior){record.tags ??= prior.tags; if(!record.url){record.url=prior.url;record.listeningProofUrl=prior.listeningProofUrl;record.listeningMappingUrl=prior.listeningMappingUrl;}}
  }
  // The edition is now curated-first: unendorsed label releases should not
  // consume Spotify/MusicBrainz verification budget or displace actual picks.
  const endorsedRecords=uniqueRecords.filter(record=>editorialEndorsement({...record,format:'Album'}));
  const evidence = filterConflictingDates(await verifyAlbums(endorsedRecords,fetcher));
  // Multiple verified primary sources can resolve to one Spotify album.
  // Never let a plain label catalogue overwrite the stronger editorial citation.
  const byListeningUrl=new Map();
  for(const row of evidence) {
    if(!row.candidate) continue;
    const candidate={...row.candidate,collectedAt:date,
      discoverySource:previous.find(item=>normalized(item.title)===normalized(row.candidate.title)
        && normalized(item.creator)===normalized(row.candidate.creator))?.provider};
    const url=canonicalUrl(candidate.url);
    const older=byListeningUrl.get(url);
    if(!older || (!older.editorialKind && candidate.editorialKind)
      || (older.editorialKind==='curator-pick' && candidate.editorialKind==='critic-pick')) byListeningUrl.set(url,candidate);
  }
  const albums=[...byListeningUrl.values()];
  const albumKeys = new Set(albums.map(item => canonicalUrl(item.url)));
  // Never carry a past verification into this run if its primary source is unavailable.
  const base = previous.filter(item => !albumKeys.has(canonicalUrl(item.url))).map(item=>
    item.format==='Album' && item.verificationStatus==='primary-verified' ? {...item,verificationStatus:'release-date-needed'} : item);
  const candidates = rollCandidates(base,[...collection.candidates,...newlyDiscoveredYouTubeMixes,...albums],now);
  const headers = {'x-bo-runner':env.BONNES_ONDES_RUNNER_TOKEN};
  const beforeKeys=new Set(state.candidates.map(item=>canonicalUrl(item.url)));
  const incremental={before:state.candidates.length,after:candidates.length,new:candidates.filter(item=>!beforeKeys.has(canonicalUrl(item.url))).length,
    catalogueCache:cached,
    retained:candidates.filter(item=>beforeKeys.has(canonicalUrl(item.url))).length};
  const profileSignalCounts=Object.fromEntries(['favoriteArtists','favoriteRadios','favoritePublications','spotify','explore','avoid'].map(key=>[key,profile[key].length]));
  profileSignalCounts.reactions=profile.signals.items.length;
  async function saveState() {
    // A consent revocation or profile edit during a long collection invalidates this observation.
    const latest=await readRunnerProfile(config,env.BONNES_ONDES_RUNNER_TOKEN,fetcher);
    if(latest.revision!==remote.revision)throw new Error('Profil modifié pendant la collecte.');
    await syncRpc(config,'bo_runner_state_save',{document:state},headers,fetcher);
    const saved=await readRunnerProfile(config,env.BONNES_ONDES_RUNNER_TOKEN,fetcher);
    if(saved.state.candidates.length!==state.candidates.length || saved.state.collections?.at(-1)?.at!==date)throw new Error('Index privé non confirmé.');
  }
  state.candidates = candidates;
  state.collections=[...(state.collections??[]),{at:date,profileRevision:remote.revision,...incremental}].slice(-90);
  state.history = [
    ...editions.map(edition=>({startsOn:edition.startsOn,number:edition.number,status:'published',
      ids:editionItems(edition).map(item=>item.id)})),
  ].slice(-104);
  state.dryRuns = state.dryRuns.filter(run => Date.parse(run.at) >= now.getTime()-14*86400000).slice(-30);
  if (mode === 'collect') {
    await saveState();
    return {status:'collected', candidates:candidates.length, albums:albums.length,incremental,profileRevision:remote.revision, catalogues:catalogues.status,press:press.status};
  }

  const lives = await verifyLives(candidates,sources,env.YOUTUBE_DATA_API_KEY,fetcher);
  const liveById = new Map(lives.items.map(item => [item.id,item]));
  // A preview comparison can exclude a previously shown mix without altering the
  // real candidate store or ordinary weekly recommendation rules.
  const previewExcludedIds=new Set(env.BONNES_ONDES_PREVIEW_DIR
    ? String(env.BONNES_ONDES_PREVIEW_EXCLUDE_YOUTUBE_IDS??'').split(',').filter(id=>/^[a-zA-Z0-9_-]{11}$/.test(id))
    : []);
  const rankedCandidates=candidates.filter(item=>!(item.mixKind==='curated-mix'
    && previewExcludedIds.has(item.embed?.id))).map(item=>liveById.get(item.id)??item);
  const report = weeklyShortlist({
    candidates:rankedCandidates, sources:collection.sources,
    profile,earlier,catalog:legacyItems,startsOn,now,seen:Object.fromEntries(previous.map(item=>[canonicalUrl(item.url),item.firstSeenAt])),
  });
  const neutral=weeklyShortlist({candidates:rankedCandidates,sources:collection.sources,
    profile:emptyTasteProfile(),earlier,catalog:legacyItems,startsOn,now,
    seen:Object.fromEntries(previous.map(item=>[canonicalUrl(item.url),item.firstSeenAt]))});
  const comparison=Object.fromEntries(Object.entries(report.selected).map(([section,rows])=>[section,{
    personalized:rows.map(row=>row.item.title),neutral:neutral.selected[section].map(row=>row.item.title),
    changed:rows.map(row=>row.item.id).join('|')!==neutral.selected[section].map(row=>row.item.id).join('|'),
  }]));
  async function writeReport(build='not-run') {
    const result=observationReport(report,{profileRevision:remote.revision,profileUpdatedAt:remote.profileUpdatedAt,
      profileSignalCounts,comparison,incremental,albumEvidence:evidence,catalogues:[...catalogues.status,...endorsements.status,...press.status],sources:collection.sources,liveStatus:lives.status,
      youtubeMixes:youtubeMixSummary,build});
    if(env.BONNES_ONDES_OBSERVATION_DIR) {
      await mkdir(env.BONNES_ONDES_OBSERVATION_DIR,{recursive:true});
      await writeFile(join(env.BONNES_ONDES_OBSERVATION_DIR,'recommendations.json'),JSON.stringify(result,null,2)+'\n',{mode:0o600});
      await writeFile(join(env.BONNES_ONDES_OBSERVATION_DIR,'recommendations.md'),renderObservation(result),{mode:0o600});
    }
    return result;
  }
  await writeReport();
  const fingerprint = createHash('sha256').update(JSON.stringify({
    sources,albumCatalogues:readJson(new URL('../editorial/album-catalogues.json',import.meta.url)),
    archivalLives:readJson(new URL('../editorial/live-archive.json',import.meta.url)),albums:registered,profileRevision:remote.revision,
    youtubeMixSearches:await readFile(new URL('./youtube-mixes.mjs',import.meta.url),'utf8'),
    ranking:await readFile(new URL('./weekly-ranking.mjs',import.meta.url),'utf8'),
    evidence:await readFile(new URL('./weekly-evidence.mjs',import.meta.url),'utf8'),
    editorial:await readFile(new URL('./editorial-endorsements.mjs',import.meta.url),'utf8'),
    recommendationPolicy:await readFile(new URL('./recommendation-policy.mjs',import.meta.url),'utf8'),
    catalogues:await readFile(new URL('./album-catalogues.mjs',import.meta.url),'utf8'),
    cycle:await readFile(new URL('./private-cycle.mjs',import.meta.url),'utf8'),
    links:await readFile(new URL('./album-links.mjs',import.meta.url),'utf8'),
    bandcamp:await readFile(new URL('./bandcamp-albums.mjs',import.meta.url),'utf8'),
    news:await readFile(new URL('./label-news.mjs',import.meta.url),'utf8'),
    providerPolicy:await readFile(new URL('./provider-policy.mjs',import.meta.url),'utf8'),
    releaseMetadata:await readFile(new URL('./release-metadata.mjs',import.meta.url),'utf8'),
    discovery:await readFile(new URL('./discovery.mjs',import.meta.url),'utf8'),
    policy:await readFile(new URL('./automation-policy.mjs',import.meta.url),'utf8'),
  })).digest('hex');
  const status = {status:'blocked',incremental,gaps:report.gaps,albums:albums.length,live:lives.items.length,
    albumRejections:evidence.filter(row=>!row.candidate).map(row=>({sourceUrl:row.sourceUrl,reason:row.reason})),
    catalogues:catalogues.status, liveStatus:lives.status, profileRevision:remote.revision};
  if (!report.complete) {
    await saveState();
    return {...status,reason:'Quotas insuffisants'};
  }
  // A critical provider error blocks publication even if older cached candidates fill its quota.
  if (collection.sources.some(source => source.status === 'error' && Object.values(report.selected).flat()
    .some(entry => entry.item.sourceId === source.sourceId))) {
    await saveState();
    return {...status,reason:'Source critique indisponible'};
  }
  const draft = publicEdition(report,earlier,legacyItems);
  for (const item of editionItems(draft)) {
    // Spotify embeds and YouTube videos have already passed their provider APIs;
    // NTS show pages and Nova episodes come from independently verified official
    // provider feeds. A crawler-blocked HTML fetch is not a dead player link.
    const host = new URL(item.url).hostname.toLowerCase();
    const alreadyVerified = item.embed?.provider === 'spotify'
      || item.embed?.provider === 'youtube'
      || ['www.nts.live','nts.live','podcasts.nova.fr','www.radiofrance.fr'].includes(host);
    if (alreadyVerified) continue;
    try { await readPublicPage(item.url,fetcher); }
    catch {
      await saveState();
      return {...status,reason:'Lien sélectionné inaccessible'};
    }
  }

  const staging = await mkdtemp(join(tmpdir(),'bonnes-ondes-release-'));
  try {
    for (const path of ['app','editorial','public','next.config.ts','package.json','tsconfig.json','postcss.config.mjs','node_modules','private-sync']) {
      cpSync(join(root,path),join(staging,path),{recursive:true,verbatimSymlinks:true,mode:constants.COPYFILE_FICLONE});
    }
    await writeFile(join(staging,'editorial/editions.json'),JSON.stringify([...editions,draft],null,2)+'\n');
    // An explicitly requested preview is isolated from the published editorial JSON.
    if (env.BONNES_ONDES_PREVIEW_DIR) {
      if (mode !== 'observe') throw new Error('La prévisualisation ne doit jamais publier.');
      const journalFile = join(staging,'app/journal.tsx');
      let journal = await readFile(journalFile,'utf8');
      const currentSelection = 'const updateEdition = () => setIssue(selectEdition(issues) ?? issues[0]);';
      const previewSelection = 'const updateEdition = () => setIssue(issues.at(-1) ?? issues[0]);';
      const libraryKey = "const storageKey = 'off-frequency.library.v1';";
      if (!journal.includes(currentSelection) || !journal.includes(libraryKey)) throw new Error('Interface de prévisualisation à revoir.');
      journal = journal.replace(currentSelection, previewSelection).replace(libraryKey,
        "const storageKey = 'off-frequency.library.preview-2026-11-23.v1';");
      await writeFile(journalFile,journal);

      // The preview must not modify the visitor's real profile or remote Supabase data.
      const syncFile = join(staging,'app/profile-sync.tsx');
      const sync = await readFile(syncFile,'utf8');
      const syncConfig = "const config = {url: process.env.NEXT_PUBLIC_SUPABASE_URL ?? '', publicKey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? ''};";
      if (!sync.includes(syncConfig)) throw new Error('Synchronisation de prévisualisation à revoir.');
      await writeFile(syncFile,sync.replace(syncConfig,"const config = {url: '', publicKey: ''};"));
      const tasteFile = join(staging,'editorial/taste-profile.mjs');
      const taste = await readFile(tasteFile,'utf8');
      const tasteKey = "export const tasteProfileKey = 'off-frequency.taste-profile.v1';";
      if (!taste.includes(tasteKey)) throw new Error('Profil de prévisualisation à revoir.');
      await writeFile(tasteFile,taste.replace(tasteKey,
        "export const tasteProfileKey = 'off-frequency.taste-profile.preview-2026-11-23.v1';"));
      const route = join(staging,'app/previsualisation/2026-11-23');
      await mkdir(route,{recursive:true});
      await writeFile(join(route,'page.tsx'),`import Journal from '../../journal';
export default function PreviewEdition() {
  return <>
    <div style={{padding:'12px 18px',background:'#f5e8cf',color:'#242424',textAlign:'center',fontSize:14,fontWeight:600}}>
      Prévisualisation de l’édition du 23 novembre 2026. La sélection publique actuelle reste inchangée.
    </div>
    <Journal />
  </>;
}
`);
    }
    // Preserve the reviewed Next configuration, including public Supabase auth configuration.
    const build = spawnSync(process.execPath,['node_modules/next/dist/bin/next','build'], {
      cwd:staging,env:{...env,NEXT_PUBLIC_BASE_PATH:'/bonnesondes'},encoding:'utf8',
    });
    if (build.status !== 0) {
      await saveState();
      return {...status,reason:'Échec du build'};
    }
    const html = await readFile(join(staging,'out/index.html'),'utf8');
    if (!html.includes('/bonnesondes/_next/')) throw new Error('Chemins statiques invalides.');
    await writeReport('passed');
    const decision = publicationDecision({at:now,startsOn,editions,complete:true,
      enabled:mode === 'publish' ? env.AUTO_PUBLISH_ENABLED : 'false',observations:state.dryRuns,fingerprint});
    if (mode === 'observe') {
      if (env.BONNES_ONDES_PREVIEW_DIR) {
        await readFile(join(staging,'out/previsualisation/2026-11-23/index.html'),'utf8');
        await mkdir(env.BONNES_ONDES_PREVIEW_DIR,{recursive:true});
        cpSync(join(staging,'out'),env.BONNES_ONDES_PREVIEW_DIR,{recursive:true});
      }
      state.dryRuns.push({id:env.GITHUB_RUN_ID ?? date,at:date,complete:true,fingerprint,
        trigger:env.GITHUB_EVENT_NAME === 'schedule' ? 'schedule' : 'manual'});
      await saveState();
      return {status:'observe',complete:true,startsOn,profileRevision:remote.revision,incremental};
    }
    await saveState();
    if (decision.status !== 'publish') return decision;
    if (!env.BONNES_ONDES_RELEASE_DIR) throw new Error('Dossier de release absent.');
    cpSync(join(staging,'out'),env.BONNES_ONDES_RELEASE_DIR,{recursive:true});
    await writeFile(join(env.BONNES_ONDES_RELEASE_DIR,'editions.json'),JSON.stringify([...editions,draft],null,2)+'\n',{mode:0o600});
    return {status:'ready',startsOn};
  } finally {
    await rm(staging,{recursive:true,force:true});
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    const result = await privateCycle({mode:process.argv[2] ?? 'observe'});
    // Only aggregate evidence and non-personal failure categories enter Actions logs.
    console.log(JSON.stringify(result));
    if (process.env.GITHUB_OUTPUT) await writeFile(process.env.GITHUB_OUTPUT,'status='+result.status+'\n',{flag:'a'});
    if (result.status === 'blocked') process.exitCode=1;
  } catch {
    console.error('Cycle interrompu. Configuration privée, fournisseur ou build indisponible.');
    process.exitCode=1;
  }
}
