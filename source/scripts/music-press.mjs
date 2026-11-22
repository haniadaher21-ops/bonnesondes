import { readPublicPage } from './album-catalogues.mjs';
import { normalized } from './release-metadata.mjs';
import { isoDate } from '../editorial/edition.mjs';

// Articles published within the previous month are leads, not proof that an
// album was released then. Primary release dates and Spotify identity are
// verified separately before any recommendation can be published.
const DAY=86400000;
const text = html => String(html).replace(/<[^>]+>/g,' ').replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#0?39;/g,"'").replace(/&nbsp;/g,' ').replace(/\s+/g,' ').trim();
const titleKey = value => normalized(value).replace(/\band\b/g,'').replace(/\s+/g,' ').trim();
const articlePath = {
  'nova-weekly': /^\/news\/[^?#]*albums-immanquables-de-la-semaine[^?#]*\/?$/i,
  'stereogum-aotw': /^\/\d+\/album-of-the-week-[a-z0-9-]+\/reviews\/album-of-the-week\/?$/i,
  'pitchfork-weekly': /^\/story\/\d+-new-albums-you-should-listen-to-now-[a-z0-9-]+\/?$/i,
};

export function musicPressLinks(html, source) {
  const listing=new URL(source.listingUrl);
  const pattern=articlePath[source.method];
  if (!pattern || typeof html!=='string') return [];
  const found=[];
  for(const match of html.matchAll(/href\s*=\s*["']([^"'<>]+)["']/gi)) {
    try {
      const url=new URL(match[1].replace(/&amp;/g,'&'),listing);
      if(url.protocol==='https:' && url.hostname===listing.hostname && pattern.test(url.pathname)) {
        const href=url.origin+url.pathname;
        if(!found.includes(href))found.push(href);
      }
    } catch {}
  }
  return found.slice(0,8);
}

export function pressPublicationDate(html) {
  const published = html.match(/"datePublished"\s*:\s*"([^"]+)"/i)?.[1]
    ?? html.match(/(?:property|name)=["']article:published_time["'][^>]*content=["']([^"']+)/i)?.[1]
    ?? html.match(/content=["']([^"']+)["'][^>]*(?:property|name)=["']article:published_time["']/i)?.[1]
    ?? html.match(/<time\b[^>]*datetime=["']([^"']+)/i)?.[1];
  const day=published?.slice(0,10);
  return isoDate(day)?day:undefined;
}

export function musicPressMentions(html, source, articleUrl, today) {
  if(typeof html!=='string'||typeof today!=='string'||!isoDate(today))return [];
  const date=pressPublicationDate(html);
  const age=date?(Date.parse(today)-Date.parse(date))/DAY:Infinity;
  if(age<0||age>30)return [];
  const matches=[];
  if(source.method==='nova-weekly'||source.method==='pitchfork-weekly') {
    const headings=[...html.matchAll(/<h2\b[^>]*>([\s\S]*?)<\/h2>/gi)].map(x=>text(x[1]));
    for(const heading of headings) {
      const match= source.method==='nova-weekly'
        ? heading.match(/^(.+?)\s*[–—-]\s*(.+)$/)
        : heading.match(/^(.+?):\s*(.+?)(?:\s*\[[^\]]+\])?$/);
      if (!match) continue;
      const artist=match[1].trim(), title=match[2].replace(/\s*\[[^\]]+\]$/,'').trim();
      if(artist.length<2||title.length<2)continue;
      matches.push({creator:artist,title});
    }
  } else if(source.method==='stereogum-aotw') {
    const h1=text(html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1]??'');
    if(/^Album Of The Week:\s*/i.test(h1))matches.push({headline:h1.replace(/^Album Of The Week:\s*/i,'')});
  }
  return matches.map(item=>({...item,editorialSource:source.name,editorialUrl:articleUrl,
    editorialPublishedAt:date,editorialKind:'curator-pick',
    editorialClaim:source.method==='stereogum-aotw'?'Album of the Week':
      source.method==='nova-weekly'?'Albums immanquables':'New albums to listen to'}));
}

export function matchMusicPress(record, mentions) {
  const artist=titleKey(record.creator??''), title=titleKey(record.title??'');
  if(!artist||!title)return;
  return mentions.find(x=>x.headline
    ? titleKey(x.headline)===artist+' '+title
    : titleKey(x.creator)===artist && titleKey(x.title)===title);
}

export async function collectMusicPress(sources,{fetcher=fetch,today=new Date().toISOString().slice(0,10)}={}) {
  const mentions=[],status=[];
  for(const source of sources) {
    if(source.mode!=='automatic') {
      status.push({source:source.name,status:source.mode==='existing'?'handled-elsewhere':'manual-review',articles:0,mentions:0});
      continue;
    }
    try {
      const html=await readPublicPage(source.listingUrl,fetcher);
      const links=musicPressLinks(html,source);
      let examined=0,verified=0;
      for(const url of links) {
        try {
          const article=await readPublicPage(url,fetcher);
          const items=musicPressMentions(article,source,url,today);
          examined++; verified+=items.length; mentions.push(...items);
        } catch { /* A blocked or changed article cannot be treated as endorsement. */ }
      }
      status.push({source:source.name,status:verified?'ok':links.length?'empty':'no-articles',
        articles:examined,mentions:verified});
    } catch(error) {
      status.push({source:source.name,status:'unavailable',articles:0,mentions:0,
        reason:String(error.message??error).slice(0,160)});
    }
  }
  return {mentions,status};
}
