import { appendFile } from 'node:fs/promises';
import { projectOrigin, readRunnerProfile } from '../private-sync/client.mjs';
import { discover } from './discovery.mjs';
import { readJson } from './editorial-files.mjs';
import { verifyLives } from './weekly-evidence.mjs';

async function privateSyncCheck() {
  const config = {url:process.env.SUPABASE_URL ?? '',publicKey:process.env.SUPABASE_PUBLISHABLE_KEY ?? ''};
  if (!config.url || !config.publicKey || !process.env.BONNES_ONDES_RUNNER_TOKEN) {
    return {ok:false,detail:'Supabase variables or runner secret missing'};
  }
  let origin;
  try { origin=projectOrigin(config.url); }
  catch { return {ok:false,detail:'SUPABASE_URL must be the HTTPS project origin'}; }
  const request = async (operation,headers) => fetch(origin+'/rest/v1/rpc/'+operation,{
    method:'POST',headers:{apikey:config.publicKey,'Content-Type':'application/json',...headers},
    body:'{}',redirect:'error',signal:AbortSignal.timeout(15000),
  });
  try {
    const anonymous=await request('bo_profile_read',{});
    await anonymous.body?.cancel();
    if (![401,403].includes(anonymous.status)) {
      return {ok:false,detail:anonymous.status===404
        ? 'Profile RPC missing or database schema unavailable'
        : 'Anonymous profile read did not return the expected denial'};
    }
    const revoked=await request('bo_runner_read',{'x-bo-runner':'integration-test-invalid-token-000000000000000000000000'});
    const denial=await revoked.json().catch(()=>({}));
    if (revoked.ok || ![400,401,403].includes(revoked.status) || denial.message!=='Access denied') {
      return {ok:false,detail:revoked.status===404
        ? 'Runner RPC missing or database schema unavailable'
        : 'Invalid runner credential was not denied as expected'};
    }
    const authenticated=await request('bo_runner_read',{'x-bo-runner':process.env.BONNES_ONDES_RUNNER_TOKEN});
    if (!authenticated.ok) {
      const error=await authenticated.json().catch(()=>({}));
      const detail=error.message==='Access denied'
        ? 'Runner token rejected: check its SHA-256 mapping and owner allowlist in Supabase'
        : 'Runner database function failed: check schema installation and permissions';
      return {ok:false,detail,anonymousDenied:true,invalidTokenDenied:true};
    }
    const stored=await authenticated.json();
    if (!stored?.profile) {
      return {ok:false,detail:'Runner authenticated, but no owner profile has been saved on the server',
        runnerAuthenticated:true,anonymousDenied:true,invalidTokenDenied:true};
    }
    const value=await readRunnerProfile(config,process.env.BONNES_ONDES_RUNNER_TOKEN);
    if (!value.state || value.state.version!==1 || !Array.isArray(value.state.candidates)
      || !Array.isArray(value.state.dryRuns)) {
      return {ok:false,detail:'Runner state schema is incomplete'};
    }
    if (!Number.isFinite(Date.parse(value.profileUpdatedAt))) {
      return {ok:false,detail:'Confirmed server profile timestamp missing'};
    }
    return {ok:true,detail:'Owner profile readable by the runner; anonymous and invalid-token reads denied'};
  } catch {
    return {ok:false,detail:'Private profile unavailable: check owner row, stored profile and runner token hash'};
  }
}

async function youtubeCheck() {
  if (!process.env.YOUTUBE_DATA_API_KEY) return {ok:false,detail:'YOUTUBE_DATA_API_KEY missing'};
  try {
    const sources=readJson(new URL('../editorial/sources.json',import.meta.url))
      .filter(source=>source.method==='youtube-atom' && !source.onlyWhenFollowed);
    const collection=await discover({sources});
    const result=await verifyLives(collection.candidates,sources,process.env.YOUTUBE_DATA_API_KEY);
    const items=result.items.map(item=>({id:item.embed.id,minutes:item.minutes,source:item.source}));
    return {ok:items.length>0,detail:result.status,videos:items,
      sourceErrors:collection.sources.filter(source=>source.errors.length).map(source=>source.sourceId)};
  } catch {
    return {ok:false,detail:'YouTube verification unavailable; inspect API enablement, key restrictions and quota'};
  }
}

const [supabase,youtube]=await Promise.all([privateSyncCheck(),youtubeCheck()]);
const report={supabase,youtube};
console.log(JSON.stringify(report,null,2));
if (process.env.GITHUB_STEP_SUMMARY) {
  await appendFile(process.env.GITHUB_STEP_SUMMARY,[
    '## Read-only integration validation',
    '- Supabase '+(supabase.ok?'passed':'blocked')+' — '+supabase.detail,
    '- YouTube '+(youtube.ok?'passed':'blocked')+' — '+youtube.detail,
    '',
    'This job does not change the owner profile, runner state, editions, Pages files or publication settings.',
    '',
  ].join('\n'));
}
if (!supabase.ok || !youtube.ok) process.exitCode=1;
