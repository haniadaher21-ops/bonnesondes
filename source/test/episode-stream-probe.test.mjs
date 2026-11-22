import {test} from 'node:test';
const sources = [
 ['fip', 'https://radiofrance-podcast.net/podcast09/35099478-7c72-4f9e-a6de-1b928400e9e5/podcast_6da709ab-470a-4054-97cd-b1241f9fedaa.xml'],
 ['nova', 'https://podcasts.nova.fr/radio-nova-nova-danse/feed/rss/website.xml'],
 ['nts', 'https://www.nts.live/api/v2/shows/canyoufeelthesun-w-call-super-parris/episodes'],
];
test('inspect official podcast media endpoints', {timeout:30000}, async () => {
  for (const [name,url] of sources) {
    try {
      const response=await fetch(url,{signal:AbortSignal.timeout(9000)});
      const body=await response.text();
      console.log('AUDIO_PROBE',name,response.status,response.headers.get('content-type'),body.length);
      if(name==='nts') {
        const data=JSON.parse(body);
        const item=data.results?.find(x=>String(x.broadcast||'').startsWith('2026-11-19'));
        console.log('AUDIO_PROBE_NTS',JSON.stringify(item||{}).slice(0,5000));
      } else {
        for (const chunk of body.match(/<item\b[\s\S]*?<\/item>/g)||[]) {
          if(/(?:La mixtape de GTA|La mixtape de James Blake|Nova Danse : 1tbsp X Miki)/i.test(chunk)) {
            console.log('AUDIO_PROBE_ITEM',name,chunk.slice(0,3300));
          }
        }
      }
    } catch(e) {console.log('AUDIO_PROBE_ERROR',name,String(e))}
  }
});
