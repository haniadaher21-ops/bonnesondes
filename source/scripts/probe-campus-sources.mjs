const origin='https://haniadaher21-ops.github.io';
const targets=[
 ['kcrw-data','https://tracklist-api.kcrw.com/Music/all/1'],
 ['kcrw-e24-special','https://tracklist-api.kcrw.com/Music/all/3'],
 ['wfmu-widget','https://wfmu.org/now-playing-widget.html'],
 ['wfmu-widget-jina','https://r.jina.ai/https://wfmu.org/now-playing-widget.html'],
 ['wfmu-recent-feed','https://r.jina.ai/https://wfmu.org/playlistfeed.xml'],
 ['wxyc-flowsheet','https://api.wxyc.org/flowsheet/current'],
 ['wxyc-latest','https://api.wxyc.org/flowsheet/latest'],
 ['wxyc-live','https://api.wxyc.org/flowsheet/now'],
 ['wxyc-main-jina','https://r.jina.ai/https://wxyc.org/'],
 ['wxyc-playlist-jina','https://r.jina.ai/https://wxyc.org/playlist'],
 ['wnur-playlists-jina','https://r.jina.ai/https://www.wnur.org/recent-playlists'],
 ['wnur-recent-full','https://www.wnur.org/recent-playlists'],
 ['kalx-live','https://r.jina.ai/https://programming.kalx.berkeley.edu/KALX/'],
 ['wrbb-live','https://r.jina.ai/https://spinitron.com/WRBB/'],
 ['kzsc-live','https://r.jina.ai/https://spinitron.com/KZSC/'],
];
await Promise.all(targets.map(async([name,url])=>{
 try {
  const headers={Origin:origin,...(name.includes('jina')||name.endsWith('-live')?{'X-Cache-Tolerance':'0','X-Respond-With':'markdown'}:{})};
  const response=await fetch(url,{signal:AbortSignal.timeout(11000),headers});
  const txt=await response.text();
  let data=null;
  if(name.startsWith('kcrw')&&response.ok){
   const rows=JSON.parse(txt);const e24=rows.filter(x=>x.program_id==='e24');
   data={total:rows.length,e24:e24.length,sample:e24.slice(0,5).map(x=>({
    title:x.title,artist:x.artist,program_id:x.program_id,fields:Object.keys(x),
    date:x.date,time:x.time,airtime:x.airtime,start_time:x.start_time,created_at:x.created_at,airdate:x.airdate,
    timestamp:x.timestamp,program_title:x.program_title,albumImage:x.albumImage,
    start:x.start,datetime:x.datetime,played_at:x.played_at
   }))};
  } else if(name.includes('jina')||name.endsWith('-live')){
   const anchor=txt.indexOf('Markdown Content:');const md=txt.slice(anchor>=0?anchor:0);
   const idxs=[...md.matchAll(/(?:\[\d{1,2}:\d{2}\s*[AP]M\]|(?:\d{1,2}:\d{2} [AP]M)|(?:Latest)|(?:just played)|(?:now playing)|(?:currently))/ig)]
     .slice(0,8).map(m=>md.slice(Math.max(0,m.index-90),m.index+210).replace(/\s+/g,' '));
   data={idxs,markdownStart:md.slice(0,1800).replace(/\s+/g,' ')};
  }else {
   data={start:txt.slice(0,1500).replace(/\s+/g,' '),interesting:txt.match(/.{0,60}(?:track|artist|now.playing|record|playlist|API|song).{0,180}/ig)?.slice(0,10).map(s=>s.replace(/\s+/g,' '))};
  }
  console.log('METADATA_DEEP '+JSON.stringify({name,status:response.status,cors:response.headers.get('access-control-allow-origin'),type:response.headers.get('content-type'),length:txt.length,data}));
 }catch(e){console.log('METADATA_DEEP '+JSON.stringify({name,error:String(e).slice(0,200)}))}
}));
