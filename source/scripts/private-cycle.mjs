import { createHash } from 'node:crypto';
import { constants, cpSync } from 'node:fs';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { canonicalUrl, editionItems, parisDate } from '../editorial/edition.mjs';
import { normalizeTasteProfile } from '../editorial/taste-profile.mjs';
import { readRunnerProfile, syncRpc } from '../private-sync/client.mjs';
import { collectAlbumCatalogues, readPublicPage } from './album-catalogues.mjs';
import { discover } from './discovery.mjs';
import { legacyEdition, legacyItems, publishedFile, readJson } from './editorial-files.mjs';
import { verifyAlbums, verifyLives, normalized } from './weekly-evidence.mjs';
import { weeklyShortlist } from './weekly-ranking.mjs';
import { editionForCycle, publicationDecision, publicEdition, rollCandidates } from './automation-policy.mjs';

const root = fileURLToPath(new URL('../',import.meta.url));

export async function privateCycle({mode = 'observe', env = process.env, now = new Date(), fetcher = fetch} = {}) {
  if (!['collect','observe','publish'].includes(mode)) throw new Error('Mode inconnu.');
  const config = {url:env.SUPABASE_URL ?? '',publicKey:env.SUPABASE_PUBLISHABLE_KEY ?? ''};
  if (!env.BONNES_ONDES_RUNNER_TOKEN) throw new Error('Accès privé non configuré.');
  const remote = await readRunnerProfile(config,env.BONNES_ONDES_RUNNER_TOKEN,fetcher);
  const profile = normalizeTasteProfile(remote.profile);
  const state = remote.state;
  if (state?.version !== 1 || !Array.isArray(state.candidates) || !Array.isArray(state.dryRuns)) throw new Error('Index privé invalide.');
  const editions = readJson(publishedFile);
  const earlier = [legacyEdition,...editions];
  const startsOn = editionForCycle(now);
  const already = editions.find(edition => edition.startsOn === startsOn);
  if (mode === 'publish' && already) return {status:'noop',reason:'Édition déjà enregistrée'};
  const sources = readJson(new URL('../editorial/sources.json',import.meta.url));
  const known = [...legacyItems,...earlier.flatMap(editionItems)];
  const [collection,catalogues] = await Promise.all([
    discover({sources,profile,existing:known,now,fetcher}),
    collectAlbumCatalogues({startsOn,today:parisDate(now),fetcher}),
  ]);
  const date = now.toISOString();
  const previous = rollCandidates(state.candidates,collection.candidates,now);
  const registered = readJson(new URL('../editorial/album-sources.json',import.meta.url));
  const linked = previous.filter(item => item.format === 'Album' && item.creator)
    .flatMap(item => (item.primaryReleaseUrls ?? []).map(sourceUrl => ({
      title:item.title,creator:item.creator,label:new URL(sourceUrl).hostname,sourceUrl,
    }))).slice(0,24);
  const evidence = await verifyAlbums([...catalogues.records,...registered,...linked],fetcher);
  const dates = new Map();
  for (const row of evidence) if (row.candidate) {
    const key = normalized(row.candidate.creator)+':'+normalized(row.candidate.title);
    if (!dates.has(key)) dates.set(key,new Set());
    dates.get(key).add(row.candidate.releaseDate);
  }
  const albums = evidence.flatMap(row => {
    const candidate = row.candidate;
    return candidate && dates.get(normalized(candidate.creator)+':'+normalized(candidate.title)).size === 1
      ? [{...candidate,collectedAt:date}] : [];
  });
  const albumKeys = new Set(albums.map(item => canonicalUrl(item.url)));
  // Never carry a past verification into this run if its primary source is unavailable.
  const base = previous.filter(item => item.verificationStatus !== 'primary-verified' && !albumKeys.has(canonicalUrl(item.url)));
  const candidates = rollCandidates(base,[...collection.candidates,...albums],now);
  const headers = {'x-bo-runner':env.BONNES_ONDES_RUNNER_TOKEN};
  async function saveState() {
    await syncRpc(config,'bo_runner_state_save',{document:state},headers,fetcher);
  }
  state.candidates = candidates;
  state.history = [
    ...editions.map(edition=>({startsOn:edition.startsOn,number:edition.number,status:'published',
      ids:editionItems(edition).map(item=>item.id)})),
  ].slice(-104);
  state.dryRuns = state.dryRuns.filter(run => Date.parse(run.at) >= now.getTime()-14*86400000).slice(-30);
  if (mode === 'collect') {
    await saveState();
    return {status:'collected', candidates:candidates.length, albums:albums.length, catalogues:catalogues.status};
  }

  const lives = await verifyLives(candidates,sources,env.YOUTUBE_DATA_API_KEY,fetcher);
  const liveById = new Map(lives.items.map(item => [item.id,item]));
  const report = weeklyShortlist({
    candidates:candidates.map(item => liveById.get(item.id) ?? item), sources:collection.sources,
    profile,earlier,catalog:legacyItems,startsOn,now,seen:Object.fromEntries(previous.map(item=>[canonicalUrl(item.url),item.firstSeenAt])),
  });
  const fingerprint = createHash('sha256').update(JSON.stringify({
    sources,albums:registered,profileRevision:remote.revision,
    ranking:await readFile(new URL('./weekly-ranking.mjs',import.meta.url),'utf8'),
    evidence:await readFile(new URL('./weekly-evidence.mjs',import.meta.url),'utf8'),
    catalogues:await readFile(new URL('./album-catalogues.mjs',import.meta.url),'utf8'),
    cycle:await readFile(new URL('./private-cycle.mjs',import.meta.url),'utf8'),
    policy:await readFile(new URL('./automation-policy.mjs',import.meta.url),'utf8'),
  })).digest('hex');
  const status = {status:'blocked',gaps:report.gaps,albums:albums.length,live:lives.items.length,
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
    await writeFile(join(staging,'next.config.ts'),"export default { output:'export', trailingSlash:true, basePath:'/bonnesondes' };\n");
    const build = spawnSync(process.execPath,['node_modules/next/dist/bin/next','build'], {
      cwd:staging,env:{...env,NEXT_PUBLIC_BASE_PATH:'/bonnesondes'},encoding:'utf8',
    });
    if (build.status !== 0) {
      await saveState();
      return {...status,reason:'Échec du build'};
    }
    const html = await readFile(join(staging,'out/index.html'),'utf8');
    if (!html.includes('/bonnesondes/_next/')) throw new Error('Chemins statiques invalides.');
    const decision = publicationDecision({at:now,startsOn,editions,complete:true,
      enabled:mode === 'publish' ? env.AUTO_PUBLISH_ENABLED : 'false',observations:state.dryRuns,fingerprint});
    if (mode === 'observe') {
      state.dryRuns.push({id:env.GITHUB_RUN_ID ?? date,at:date,complete:true,fingerprint});
      await saveState();
      return {status:'observe',complete:true,startsOn};
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
