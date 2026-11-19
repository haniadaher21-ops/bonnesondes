import {mkdir,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {privateCycle} from './private-cycle.mjs';
const directory=process.env.BONNES_ONDES_OBSERVATION_DIR;
if(!directory)throw new Error('Dossier de rapport requis.');
if(process.env.AUTO_PUBLISH_ENABLED!=='false')throw new Error('Observation exclusivement non publiante.');
await mkdir(directory,{recursive:true});
const results=[];
for(const [index,mode] of ['collect','observe','observe'].entries()) {
  const result=await privateCycle({mode,env:{...process.env,BONNES_ONDES_OBSERVATION_DIR:join(directory,'run-'+(index+1)),GITHUB_RUN_ID:process.env.GITHUB_RUN_ID+'-'+index}});
  results.push(result);
  console.log(JSON.stringify({run:index+1,mode,status:result.status,complete:result.complete??false,gaps:result.gaps,
    profileRevision:result.profileRevision,incremental:result.incremental}));
}
await writeFile(join(directory,'summary.json'),JSON.stringify(results,null,2)+'\n');
if(process.env.GITHUB_STEP_SUMMARY)await writeFile(process.env.GITHUB_STEP_SUMMARY,
  '## Observations privées sans publication\n\n'+results.map((row,i)=>'- Run '+(i+1)+': '+row.status+'; manques '+JSON.stringify(row.gaps??{})).join('\n')
  +'\n\nLes recommandations publiques et preuves sont dans l’artefact de revue. Le profil et l’index privé restent dans Supabase.\n',{flag:'a'});
if(results.some(row=>row.status==='blocked'))process.exitCode=1;
