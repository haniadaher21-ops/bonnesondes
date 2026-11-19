import {setTimeout as pause} from 'node:timers/promises';
import {sourceUrl} from '../editorial/edition.mjs';
import {normalized} from './release-metadata.mjs';
import {readPublicPage,albumListeningLink} from './album-catalogues.mjs';
const userAgent='BonnesOndes/1.0 (https://github.com/haniadaher21-ops/bonnesondes)';
const spotifyAlbum=url=>{
  const value=sourceUrl(url);
  const id=value?.origin==='https://open.spotify.com' && value.pathname.match(/^\/(?:intl-[a-z]+\/)?album\/([a-zA-Z0-9]{22})\/?$/)?.[1];
  return id?'https://open.spotify.com/album/'+id:undefined;
};
export function listeningResolver(fetcher=fetch, wait=pause) {
  let next=0,queries=0;
  const cache=new Map();
  async function musicbrainz(path) {
    await wait(Math.max(0,next-Date.now()));
    next=Date.now()+1100;
    const response=await fetcher('https://musicbrainz.org/ws/2/'+path,{headers:{'User-Agent':userAgent},redirect:'error',signal:AbortSignal.timeout(12000)});
    if(!response.ok)throw new Error('MusicBrainz HTTP '+response.status);
    return response.json();
  }
  return async record=>{
    const key=normalized(record.creator)+':'+normalized(record.title);
    if(cache.has(key))return cache.get(key);
    const resolve=(async()=>{
      const html=record.evidenceHtml??'';
      const direct=albumListeningLink(html);
      if(direct)return {url:direct,proof:record.sourceUrl};
      // Follow only explicit official release landing links, never guess a Spotify ID or URL.
      const links=[...new Set([...html.matchAll(/href=["'](https:\/\/[^"'\s<>]+)["']/gi)].map(x=>x[1].replaceAll('&amp;','&')))];
      for(const url of links.filter(value=>{
        const parsed=sourceUrl(value);return parsed && /(?:^|\.)(?:lnk\.to|ffm\.to|band\.link)$/.test(parsed.hostname);
      }).slice(0,3)) {
        try {const target=albumListeningLink(await readPublicPage(url,fetcher));if(target)return {url:target,proof:url};}catch{/* Try the next explicit link. */}
      }
      // Optional community link discovery only; it never supplies the authoritative release date.
      if(queries++>=8)return {reason:'Budget de résolution MusicBrainz atteint'};
      try {
        const quote=value=>'"'+value.replace(/["\\]/g,' ')+'"';
        const query=new URLSearchParams({query:'release:'+quote(record.title)+' AND artist:'+quote(record.creator),fmt:'json',limit:'5'});
        const search=await musicbrainz('release/?'+query);
        const exact=(search.releases??[]).filter(row=>normalized(row.title)===normalized(record.title)
          && normalized((row['artist-credit']??[]).map(x=>(x.name??x.artist?.name??'')+(x.joinphrase??'')).join(''))===normalized(record.creator));
        const targets=new Map();
        for(const row of exact.slice(0,2)) {
          if(!/^[a-f0-9-]{36}$/.test(row.id))continue;
          const release=await musicbrainz('release/'+row.id+'?inc=url-rels&fmt=json');
          for(const relation of release.relations??[]) {
            const url=spotifyAlbum(relation.url?.resource);
            if(url)targets.set(url,'https://musicbrainz.org/release/'+row.id);
          }
        }
        if(targets.size===1){const [url,proof]=[...targets][0];return {url,proof};}
        return {reason:targets.size>1?'Liens Spotify ambigus':'Aucun lien Spotify confirmé'};
      }catch(error){return {reason:error.message};}
    })();
    cache.set(key,resolve);return resolve;
  };
}
