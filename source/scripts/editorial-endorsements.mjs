import { bandcampAlbum, bandcampLinks } from './bandcamp-albums.mjs';
import { readPublicPage, plain } from './album-catalogues.mjs';
import { normalized } from './release-metadata.mjs';

const editions = ['https://daily.bandcamp.com/album-of-the-day?page=1',
  'https://daily.bandcamp.com/album-of-the-day?page=8'];
const officialArticle = /^https:\/\/daily\.bandcamp\.com\/album-of-the-day\/[a-z0-9-]+\/?$/i;
const decode = html => plain(String(html).replace(/&quot;/g,'"').replace(/&#(?:39|x27);/gi,"'")
  .replace(/&ldquo;|&rdquo;/g,'"').replace(/&lsquo;|&rsquo;/g,"'")
  .replace(/&amp;/g,'&'));

export function bandcampDailyLinks(html, base = editions[0]) {
  if (typeof html !== 'string') return [];
  const matches = [...html.matchAll(/href\s*=\s*["']([^"']+)["']/gi)];
  return [...new Set(matches.flatMap(match => {
    try {
      const url = new URL(match[1].replace(/&amp;/g,'&'), base);
      return officialArticle.test(url.origin + url.pathname) ? [url.origin + url.pathname] : [];
    } catch { return []; }
  }))];
}

export function bandcampDailyIdentity(html) {
  if(typeof html !== 'string' || !/album of the day/i.test(html)) return;
  const head = html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1];
  const meta = html.match(/<meta\b[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/i)?.[1]
    ?? html.match(/<title\b[^>]*>([^<]+)<\/title>/i)?.[1];
  const label = decode(head || meta || '').replace(/\s*\|\s*Bandcamp Daily.*$/i,'').trim();
  const parts = label.match(/^(.+?),\s*["“]([^"”]+)["”](?:\s+.*)?$/u);
  if(!parts) return;
  const creator = parts[1].trim(), title = parts[2].trim();
  return normalized(title) && normalized(creator) ? {title,creator} : undefined;
}

export function endorsedAlbum(record, citation) {
  if(!record || !citation || normalized(record.title)!==normalized(citation.title)
      || normalized(record.creator)!==normalized(citation.creator) || !officialArticle.test(citation.url)) return;
  return {...record,editorialSource:'Bandcamp Daily',editorialUrl:citation.url,
    editorialKind:'curator-pick',editorialClaim:'Album of the Day'};
}

export async function collectEditorialEndorsements({fetcher=fetch}={}) {
  const records=[], status=[], seen=new Set();
  // These are *editorial picks*. A label's catalogue is never an endorsement.
  for(const listing of editions) {
    try {
      const links=bandcampDailyLinks(await readPublicPage(listing,fetcher)).slice(0,9);
      let verified=0;
      for(const url of links) {
        if(seen.has(url)) continue;
        seen.add(url);
        try {
          const article = await readPublicPage(url,fetcher);
          const identity = bandcampDailyIdentity(article);
          if(!identity) continue;
          const albumLinks=bandcampLinks(article,url).slice(0,4);
          for(const albumUrl of albumLinks) {
            try {
              const release=bandcampAlbum(await readPublicPage(albumUrl,fetcher),albumUrl,'Bandcamp Daily');
              const record=endorsedAlbum(release,{...identity,url});
              if(record){records.push(record);verified++;break;}
            } catch { /* Try another direct release link on the official article. */ }
          }
        } catch { /* Unavailable articles never become endorsements. */ }
      }
      status.push({source:'Bandcamp Daily',listing,articles:links.length,eligibleVerified:verified,status:verified?'ok':'empty'});
    } catch(error) {
      status.push({source:'Bandcamp Daily',listing,eligibleVerified:0,status:'unavailable',reason:error.message});
    }
  }
  return {records,status};
}
