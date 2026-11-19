import {isoDate} from '../editorial/edition.mjs';
const decodeHtml=value=>value.replace(/&quot;/g,'"').replace(/&amp;/g,'&').replace(/&#(\d+);/g,(_,n)=>String.fromCodePoint(Number(n)));
const normalized=value=>String(value??'').normalize('NFKD').replace(/\p{M}/gu,'').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim();
export function releaseDayArticle(html,url,label) {
  const heading=decodeHtml(html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1]??'').replace(/<[^>]+>/g,' ').trim();
  const parts=heading.split(/\s+[–—-]\s+/);
  if(parts.length!==2)return;
  const creator=parts[0].trim(),title=parts[1].replace(/^[‘’“”'"]+|[‘’“”'"]+$/g,'').trim();
  const visible=normalized(decodeHtml(html.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi,'').replace(/<[^>]+>/g,' ')));
  if(!creator||!title||!visible.includes(normalized(title))||!visible.includes('today marks the release of')
    || !/\b(?:debut|new) album\b/.test(visible)||/\b(reissue|remastered|anniversary)\b/.test(normalized(title)))return;
  const date=html.match(/<meta\b[^>]*property=["']article:published_time["'][^>]*content=["']([^"']+)/i)?.[1];
  if(!date || !Number.isFinite(Date.parse(date)) || !isoDate(date.slice(0,10)))return;
  return {title,creator,label,releaseDate:date.slice(0,10),sourceUrl:url,dateProofUrl:url,
    method:'label-release-day',evidenceHtml:html};
}
