import { readPublicPage } from './album-catalogues.mjs';
import { normalized } from './release-metadata.mjs';
import { isoDate } from '../editorial/edition.mjs';
import { bandcampLinks } from './bandcamp-albums.mjs';
import { parseFeed } from './discovery-feeds.mjs';

// Articles published within the previous month are leads, not proof that an
// album was released then. Primary release dates and Spotify identity are
// verified separately before any recommendation can be published.
const DAY=86400000;
const text = html => String(html).replace(/<[^>]+>/g,' ')
  .replace(/&#(x[0-9a-f]+|[0-9]+);?/gi,(_,code) => {
    const value=code.toLowerCase().startsWith('x') ? Number.parseInt(code.slice(1),16) : Number(code);
    return Number.isInteger(value) && value>0 && value<=0x10ffff && !(value>=0xd800 && value<=0xdfff)
      ? String.fromCodePoint(value) : ' ';
  })
  .replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&nbsp;/g,' ')
  .replace(/\s+/g,' ').trim();
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

export function nprMusicFridayMentions(xml,source,today) {
  let parsed;
  try { parsed=parseFeed(xml); } catch { return []; }
  const episodes=parsed.rss?.channel?.item??[];
  const mentions=[];
  for(const episode of episodes.slice(0,35)) {
    const title=String(episode.title??'');
    if(!/new music friday/i.test(title))continue;
    const pubDate=Number.isFinite(Date.parse(episode.pubDate??''))
      ? new Date(episode.pubDate).toISOString().slice(0,10) : undefined;
    const age=pubDate?(Date.parse(today)-Date.parse(pubDate))/DAY:Infinity;
    if(age<0||age>30)continue;
    const link=String(episode.link??'');
    let valid;
    try {
      const url=new URL(link);
      valid=url.protocol==='https:' && ['www.npr.org','npr.org'].includes(url.hostname)
        && /new-music-friday/.test(url.pathname);
    } catch {valid=false;}
    if(!valid)continue;
    const raw=episode.description?.['#text']??episode.description??'';
    const description=text(raw);
    const start=description.toLowerCase().indexOf('the starting 5');
    if(start<0)continue;
    const limit=description.toLowerCase().indexOf('the lightning round',start);
    const picks=description.slice(start,limit<0?undefined:limit);
    // Parse explicitly named, paired artist and album titles from the
    // broadcaster's own episode notes, never transcribe speech speculatively.
    const rx=/-\s*([^,\n]{2,80}),\s*['"“]([^'"”]{2,120})['"”]/g;
    for(const match of picks.matchAll(rx)) {
      const creator=match[1].trim().replace(/\s*\(.*?\)\s*/g,'');
      const album=match[2].trim();
      if(!creator||!album)continue;
      mentions.push({creator,title:album,editorialSource:source.name,
        editorialUrl:link,editorialPublishedAt:pubDate,
        editorialKind:'curator-pick',editorialClaim:'New Music Friday'});
    }
  }
  return mentions;
}

// When a press article itself links to an artist's original Bandcamp album,
// the link can become a genuine discovery lead. Align each link to its
// heading, and let verifyAlbums independently check the primary release date,
// album identity, Spotify link and artwork before it can rank.
export function musicPressAlbumReferences(html, articleUrl, mentions) {
  if (typeof html !== 'string' || !Array.isArray(mentions)) return [];
  const sections = [...html.matchAll(/<h2\b[^>]*>([\s\S]*?)<\/h2>/gi)];
  const records = [];
  for (let i = 0; i < sections.length; i++) {
    const head = text(sections[i][1]).replace(/\s*\[[^\]]+\]\s*$/, '');
    const parsed = head.match(/^(.+?):\s*(.+)$/);
    if (!parsed) continue;
    const creator = parsed[1].trim(), title = parsed[2].trim();
    const mention = mentions.find(m => m.title && titleKey(m.title) === titleKey(title)
      && titleKey(m.creator) === titleKey(creator));
    if (!mention) continue;
    const section = html.slice(sections[i].index + sections[i][0].length,
      sections[i+1]?.index ?? html.length);
    const bandcamp = bandcampLinks(section, articleUrl);
    // Ambiguous sections (e.g. two related reissues) must not be mapped
    // automatically to a single album.
    if (bandcamp.length !== 1) continue;
    const ids = [...new Set([...section.matchAll(/https:\/\/open\.spotify\.com\/(?:intl-[a-z]+\/)?album\/([a-zA-Z0-9]{22})/gi)].map(m=>m[1]))];
    const albumUrl = ids.length === 1 ? 'https://open.spotify.com/album/' + ids[0] : undefined;
    records.push({
      title,creator,sourceUrl:bandcamp[0],method:'bandcamp-album',
      label:mention.editorialSource??'Musical press', ...mention,
      ...(albumUrl && {url:albumUrl}),
    });
  }
  return records.slice(0,8);
}

export function matchMusicPress(record, mentions) {
  const artist=titleKey(record.creator??''), title=titleKey(record.title??'');
  if(!artist||!title)return;
  return mentions.find(x=>x.headline
    ? titleKey(x.headline)===artist+' '+title
    : titleKey(x.creator)===artist && titleKey(x.title)===title);
}

export async function collectMusicPress(sources,{fetcher=fetch,today=new Date().toISOString().slice(0,10)}={}) {
  const mentions=[],records=[],status=[];
  for(const source of sources) {
    if(source.mode!=='automatic') {
      status.push({source:source.name,status:source.mode==='existing'?'handled-elsewhere':'manual-review',articles:0,mentions:0});
      continue;
    }
    try {
      const html=await readPublicPage(source.listingUrl,fetcher);
      if(source.method==='npr-new-music-friday') {
        const items=nprMusicFridayMentions(html,source,today);
        mentions.push(...items);
        status.push({source:source.name,status:items.length?'ok':'empty',articles:items.length?1:0,mentions:items.length});
        continue;
      }
      const links=musicPressLinks(html,source);
      let examined=0,verified=0;
      for(const url of links) {
        try {
          const article=await readPublicPage(url,fetcher);
          const items=musicPressMentions(article,source,url,today);
          examined++; verified+=items.length; mentions.push(...items);
          records.push(...musicPressAlbumReferences(article,url,items));
        } catch { /* A blocked or changed article cannot be treated as endorsement. */ }
      }
      status.push({source:source.name,status:verified?'ok':links.length?'empty':'no-articles',
        articles:examined,mentions:verified});
    } catch(error) {
      status.push({source:source.name,status:'unavailable',articles:0,mentions:0,
        reason:String(error.message??error).slice(0,160)});
    }
  }
  return {mentions,records,status};
}
