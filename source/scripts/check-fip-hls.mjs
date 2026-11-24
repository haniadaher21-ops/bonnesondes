const channels=['fip','fipgroove','fiprock','fipjazz','fipelectro'];
const urls=channels.map(channel=>'https://stream.radiofrance.fr/'+channel+'/'+channel+'_hifi.m3u8');
urls.push('https://cdn.jsdelivr.net/npm/hls.js@1.7.4/dist/hls.min.js');
for(const url of urls) {
  try {
    const response=await fetch(url,{headers:{Origin:'https://haniadaher21-ops.github.io'},signal:AbortSignal.timeout(12000)});
    const text=(await response.text()).slice(0,2500);
    const next=text.split('\n').find(line=>line.trim()&&!line.startsWith('#'))?.trim();
    if(url.endsWith('.m3u8') && response.ok) {
      const segments=text.split('\n').filter(line=>line.trim()&&!line.startsWith('#'));
      const last=segments.at(-1)?.trim();
      if(last) {
        const segmentUrl=new URL(last,url);
        const segment=await fetch(segmentUrl,{headers:{Origin:'https://haniadaher21-ops.github.io',Range:'bytes=0-1023'},signal:AbortSignal.timeout(9000)});
        console.log('FIP_HLS_SEGMENT',JSON.stringify({channel:url,status:segment.status,
          type:segment.headers.get('content-type'),cors:segment.headers.get('access-control-allow-origin')}));
        await segment.body?.cancel();
      }
    }

    console.log('FIP_HLS_CHECK',JSON.stringify({url,status:response.status,
      cors:response.headers.get('access-control-allow-origin'),type:response.headers.get('content-type'),
      marker:text.slice(0,100),hasM3u8:text.startsWith('#EXTM3U'),firstVariant:next,
      usesDiscontinuity:text.includes('EXT-X-DISCONTINUITY')}));
  } catch(e) {
    console.log('FIP_HLS_CHECK',JSON.stringify({url,error:String(e)}));
  }
}
