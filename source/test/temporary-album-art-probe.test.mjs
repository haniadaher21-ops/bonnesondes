import {test} from 'node:test';
test('check exact Spotify album artwork for editorial edition 002', {timeout: 28000}, async () => {
  for(const [name,id] of [
    ['Aesop Rock & Blockhead Trouble Mountain','0Fta5KudJiX6HpDWApUu8y'],
    ['Krill Secret Language','7I8TcuLTY8CTwXqVys8GD3'],
  ]) {
    const u='https://open.spotify.com/oembed?url='+encodeURIComponent('https://open.spotify.com/album/'+id);
    try {
      const r=await fetch(u,{signal:AbortSignal.timeout(12000)});
      const data=await r.json();
      console.log('ALBUM_COVER_CHECK',JSON.stringify({name,status:r.status,title:data.title,thumbnail:data.thumbnail_url,iframe:data.iframe_url,provider:data.provider_name}));
    } catch(e) {console.log('ALBUM_COVER_ERROR',name,String(e))}
  }
});
