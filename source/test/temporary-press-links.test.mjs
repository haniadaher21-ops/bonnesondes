import {test} from 'node:test';
import {readPublicPage} from '../scripts/album-catalogues.mjs';
import {bandcampLinks,bandcampAlbum} from '../scripts/bandcamp-albums.mjs';
import {musicPressMentions,musicPressAlbumReferences} from '../scripts/music-press.mjs';
test('inspect outgoing primary album references from real curated articles',{timeout:55000},async()=>{
 const pages=[
  ['Nova','https://www.nova.fr/news/andeol-ladaniva-h-jeunecrack-les-albums-immanquables-de-la-semaine-469377-18-11-2026/'],
  ['Stereogum','https://stereogum.com/2517187/album-of-the-week-krill-secret-language/reviews/album-of-the-week'],
  ['Pitchfork','https://pitchfork.com/story/9-new-albums-you-should-listen-to-now-2hollis-armand-hammer-and-more/'],
 ];
 const results=await Promise.all(pages.map(async([name,url])=>{
  const html=await readPublicPage(url);
  const links=[...new Set([...html.matchAll(/href=["']([^"']+)["']/gi)]
   .map(m=>m[1].replaceAll('&amp;','&')).filter(x=>/bandcamp\.com|rhymesayers|spotify\.com|subpop\.com|explodinginsound/.test(x)))].slice(0,25);
  const source={name,method:name==='Pitchfork'?'pitchfork-weekly':name==='Nova'?'nova-weekly':'stereogum-aotw'};
  const mentions=musicPressMentions(html,source,url,'2026-11-22');
  return {name,bandcamp:bandcampLinks(html,url).slice(0,12),links,
    direct:musicPressAlbumReferences(html,url,mentions).slice(0,12).map(x=>({creator:x.creator,title:x.title,sourceUrl:x.sourceUrl,url:x.url}))};
 }));
 console.log('PRESS_PRIMARY_LINK_PROBE',JSON.stringify(results));
});

test('check exact album releases and Spotify alternate ids',{timeout:40000},async()=>{
 const albums=[
   ['Krill','https://wheretheresakrilltheresaway.bandcamp.com/album/secret-language'],
   ['Aesop Rock & Blockhead','https://aesoprock.bandcamp.com/album/trouble-mountain'],
 ];
 const rows=await Promise.all(albums.map(async([name,url])=>{
  try {
   const html=await readPublicPage(url);
   const release=bandcampAlbum(html,url,name);
   return {name,parsed:!!release,title:release?.title,creator:release?.creator,date:release?.releaseDate};
  }catch(error){return {name,error:String(error)}}
 }));
 const ids=['0Fta5KudJiX6HpDWApUu8y','0QGtOoyctKBPjgs7ihFxLv'];
 const embeds=await Promise.all(ids.map(async id=>{
  try{
   const resp=await fetch('https://open.spotify.com/oembed?url='+encodeURIComponent('https://open.spotify.com/album/'+id),{signal:AbortSignal.timeout(9000)});
   const x=await resp.json();
   return {id,status:resp.status,title:x.title};
  }catch(error){return {id,error:String(error)}}
 }));
 console.log('ALBUM_RELEASE_VERIFICATION',JSON.stringify({rows,embeds}));
});
