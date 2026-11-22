import {test} from 'node:test';
import {readPublicPage} from '../scripts/album-catalogues.mjs';
import {bandcampLinks} from '../scripts/bandcamp-albums.mjs';
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
  return {name,bandcamp:bandcampLinks(html,url).slice(0,12),links};
 }));
 console.log('PRESS_PRIMARY_LINK_PROBE',JSON.stringify(results));
});
