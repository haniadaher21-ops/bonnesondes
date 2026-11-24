const targets = [
 ['kcrw-json','https://tracklist-api.kcrw.com/Eclectic24/all/5'],
 ['kcrw-music','https://tracklist-api.kcrw.com/Music/all/1'],
 ['kcrw-e24','https://tracklist-api.kcrw.com/Eclectic24'],
 ['kcrw-playlists','https://www.kcrw.com/playlists'],
 ['kcrw-e24-page','https://www.kcrw.com/shows/eclectic24/latest'],
 ['wxyc-dj','https://dj.wxyc.org/'],
 ['wxyc-dj-api','https://dj.wxyc.org/api/playlist'],
 ['wxyc-main','https://wxyc.org/listen/'],
 ['wnur-playlists','https://www.wnur.org/recent-playlists'],
 ['wnur-home','https://www.wnur.org/'],
 ['wfmu-playlists','https://wfmu.org/playlists'],
 ['wfmu-page','https://wfmu.org/'],
 ['wfmu-feed','https://wfmu.org/playlistfeed.xml'],
 ['spinitron-kalx','https://spinitron.com/KALX/'],
 ['spinitron-wrbb','https://spinitron.com/WRBB/'],
 ['spinitron-wnur','https://spinitron.com/WNUR/'],
 ['spinitron-kzsc','https://spinitron.com/KZSC/'],
 ['jina-kalx','https://r.jina.ai/https://programming.kalx.berkeley.edu/KALX/'],
 ['jina-kalx-params','https://r.jina.ai/https://programming.kalx.berkeley.edu/KALX/?v='+Date.now()],
 ['widget-kalx','https://widgets.spinitron.com/widget/now-playing-v2?station=KALX&num=3&cover=1'],
 ['radiocult','https://api.radiocult.fm/api/station/worldwide-fm/schedule/live']
];
await Promise.all(targets.map(async ([name,url])=>{
 try{
 const response=await fetch(url,{signal:AbortSignal.timeout(9000),headers:{
   Origin:'https://haniadaher21-ops.github.io',
   ...(name.startsWith('jina')?{'X-Cache-Tolerance':'0','X-Respond-With':'markdown'}:{})
 }});
 const type=response.headers.get('content-type');
 const body=(await response.text()).slice(0,90000);
 const compact=body.replace(/\s+/g,' ').slice(0,900);
 const matches=Object.fromEntries(['__NEXT_DATA__','application/ld+json','timestamp','playlist','tracklist','api/','now_playing','current'].map(w=>[w,body.toLowerCase().includes(w.toLowerCase())]));
 const last=body.match(/.{0,90}(?:now.playing|current.track|tracklist.api|spinitron|__NEXT_DATA__|api\/v1|playlist.{0,15}json).{0,150}/i)?.[0];
 console.log('META_PROBE '+JSON.stringify({name,status:response.status,url:response.url,cors:response.headers.get('access-control-allow-origin'),
 type,length:body.length,compact,last,matches}));
 }catch(e){console.log('META_PROBE '+JSON.stringify({name,error:String(e).slice(0,140)}));}
}));
