import {isoDate, sourceUrl} from '../editorial/edition.mjs';
import {normalized} from './release-metadata.mjs';

export const decodeHtml = text => text.replace(/&quot;/g,'"').replace(/&#0?39;|&apos;/g,"'").replace(/&amp;/g,'&').replace(/&#(\d+);/g,(_,n)=>String.fromCodePoint(Number(n)));
const reissue = /\b(reissue|remaster(?:ed)?|anniversary|deluxe|expanded|EP)\b/i;
export function bandcampLinks(html, base) {
  const links=[];
  for(const match of html.matchAll(/href=["']([^"']+)["']/g)) {
    try {
      const url=new URL(decodeHtml(match[1]),base);
      if(url.protocol!=='https:' || url.username || url.password || url.port || !/^[a-z0-9-]+\.bandcamp\.com$/.test(url.hostname)
        || !/^\/album\/[^/]+\/?$/.test(url.pathname)) continue;
      url.search='';url.hash='';links.push(url.href);
    } catch { /* Ignore malformed non-release links. */ }
  }
  return [...new Set(links)];
}
export function bandcampAlbum(html, url, label) {
  let tralbum;
  try {tralbum=JSON.parse(decodeHtml(html.match(/data-tralbum=["']([\s\S]*?)["']\s/i)?.[1]??''));}catch{return;}
  const date=new Date(tralbum.album_release_date);
  if(!Number.isFinite(+date))return;
  const releaseDate=date.toISOString().slice(0,10);
  const records=[];
  for(const match of html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {const data=JSON.parse(match[1]);records.push(...[data,data?.['@graph']??[]].flat(2));}catch{/* Individual blocks may be malformed. */}
  }
  for(const node of records) {
    if(![node?.['@type']].flat().includes('MusicAlbum') || node.albumReleaseType!=='AlbumRelease')continue;
    const title=node.name?.trim(),creator=node.byArtist?.name?.trim();
    if(!title||!creator||reissue.test(title)||!isoDate(releaseDate) || normalized(title)!==normalized(tralbum.current?.title)
      || normalized(creator)!==normalized(tralbum.artist))continue;
    const jsonDate=new Date(node.datePublished);
    if(!Number.isFinite(+jsonDate) || jsonDate.toISOString().slice(0,10)!==releaseDate)continue;
    // Upload dates, commerce dates, singles and later physical reissues are not original-release proof.
    const about=tralbum.current?.about??'';
    if(/\b(originally released|re-?issue|remaster(?:ed)?|anniversary edition)\b/i.test(about))continue;
    const canonical=sourceUrl(node['@id']??node.url);
    if(!canonical||canonical.origin+canonical.pathname!==new URL(url).origin+new URL(url).pathname)continue;
    const tags=[...html.matchAll(/<a\b[^>]*class=["'][^"']*tag[^"']*["'][^>]*>([^<]+)<\/a>/gi)].map(x=>decodeHtml(x[1]).trim()).filter(x=>x.length<80).slice(0,20);
    return {title,creator,label,method:'bandcamp-album',releaseDate,sourceUrl:url,dateProofUrl:url,tags,evidenceHtml:html};
  }
}
