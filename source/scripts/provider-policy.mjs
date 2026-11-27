import {setTimeout as pause} from 'node:timers/promises';
// Bandcamp rate limits span subdomains. Serialize them as one provider and stop on its first 429.
export function publicProviderFetcher(fetcher,{now=new Date(),backoff={},wait=pause}={}) {
  let queue=Promise.resolve(),next=0;
  let mbQueue=Promise.resolve(),mbNext=0;
  return (url,options)=>{
    const host=new URL(url).hostname;
    // Album link resolution and artist enrichment share one MusicBrainz budget.
    // Avoid successive calls from independent modules in the same runner.
    if(host==='musicbrainz.org'){
      const task=mbQueue.then(async()=>{
        await wait(Math.max(0,mbNext-Date.now()));
        mbNext=Date.now()+2500;
        return fetcher(url,options);
      });
      mbQueue=task.then(()=>{},()=>{});return task;
    }
    if(!host.endsWith('.bandcamp.com'))return fetcher(url,options);
    const task=queue.then(async()=>{
      if(Date.parse(backoff.bandcamp)>+now)return new Response('',{status:429});
      await wait(Math.max(0,next-Date.now()));
      next=Date.now()+1100;
      const response=await fetcher(url,options);
      if(response.status===429) {
        const seconds=Number(response.headers.get('retry-after'));
        const retryAt=Number.isFinite(seconds)?NaN:Date.parse(response.headers.get('retry-after')??'');
        backoff.bandcamp=new Date(Math.max(+now+3600000,Number.isFinite(seconds)?+now+seconds*1000:0,Number.isFinite(retryAt)?retryAt:0)).toISOString();
      }
      return response;
    });
    queue=task.then(()=>{},()=>{});return task;
  };
}
