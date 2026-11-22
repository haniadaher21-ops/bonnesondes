import {test} from 'node:test';
import config from '../editorial/music-press.json' with {type:'json'};
import {readPublicPage} from '../scripts/album-catalogues.mjs';
import {musicPressLinks,musicPressMentions,pressPublicationDate,nprMusicFridayMentions} from '../scripts/music-press.mjs';
test('temporary check actual public music press sources',{timeout:60000},async()=>{
 const sources=config.filter(x=>x.mode==='automatic');
 const result=await Promise.all(sources.map(async source=>{
  try{
   const doc=await readPublicPage(source.listingUrl);
   if(source.method==='npr-new-music-friday'){
    const picks=nprMusicFridayMentions(doc,source,'2026-11-22');
    return {source:source.name,size:doc.length,picks:picks.map(x=>({creator:x.creator,title:x.title,date:x.editorialPublishedAt})).slice(0,5)};
   }
   const links=musicPressLinks(doc,source);
   const articles=await Promise.all(links.slice(0,2).map(async url=>{
    try{const page=await readPublicPage(url);return {url,size:page.length,date:pressPublicationDate(page),
      headings:[...page.matchAll(/<h2\b[^>]*>([\s\S]*?)<\/h2>/gi)].slice(0,15).map(m=>m[1].replace(/<[^>]+>/g,' ').slice(0,160)),
      jsonDates:[...page.matchAll(/"datePublished"\s*:\s*"([^"]+)"/gi)].slice(0,6).map(m=>m[1]),
      picks:musicPressMentions(page,source,url,'2026-11-22').slice(0,5)}}
    catch(e){return {url,error:String(e)}}
   }));
   return {source:source.name,size:doc.length,links:links.length,articles};
  }catch(e){return {source:source.name,error:String(e)}}
 }));
 console.log('PRESS_LIVE_PROBE',JSON.stringify(result));
});
