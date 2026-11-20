// Public "C'était quoi ce titre" for the selected Nova station, via a CORS
// readable HTML relay. These are timestamped broadcasts, not guaranteed to be
// the audio currently playing (Nova sends empty ICY stream metadata).
import { radioArtworkUrl } from './radio-artwork.mjs';
const decode = text => text.replace(/&(?:#(x[0-9a-f]+|[0-9]+)|amp|lt|gt|quot|apos|nbsp);/gi,(entity,number)=>{
  if(number){
    const code=number[0].toLowerCase()==='x'?parseInt(number.slice(1),16):parseInt(number,10);
    return Number.isFinite(code)&&code>0&&code<=0x10ffff?String.fromCodePoint(code):'';
  }
  return ({'&amp;':'&','&lt;':'<','&gt;':'>','&quot;':'"','&apos;':"'",'&nbsp;':' '})[entity.toLowerCase()]??entity;
}).replace(/\s+/g,' ').trim();

export function parseNovaNowPlaying(html, at = new Date()) {
  if(typeof html!=='string'||html.length>20000||!html.includes('wwtt_content'))return null;
  const first=html.indexOf('wwtt_content');
  const next=html.indexOf('<div class="swiper-slide"',first);
  // Never accidentally pair the time of one track with the artwork of the next.
  const slide=html.slice(first,next<0?Math.min(html.length,first+7000):next);
  const matchTime=slide.match(/<p\s+class=["']time["']\s*>\s*([0-2]?\d):([0-5]\d)\s*<\/p>/i);
  const matchTitle=slide.match(/<h2\b[^>]*>\s*<a\b[^>]*>([^<]+)<\/a>\s*<\/h2>\s*<p\b[^>]*>([^<]+)<\/p>/i);
  if(!matchTime||!matchTitle)return null;
  const hour=Number(matchTime[1]), minute=Number(matchTime[2]);
  if(hour>23)return null;
  const artist=decode(matchTitle[1]), title=decode(matchTitle[2]);
  if(!artist||!title||artist.length>180||title.length>180)return null;
  const formatter=new Intl.DateTimeFormat('en-GB',{
    timeZone:'Europe/Paris',hour:'2-digit',minute:'2-digit',hourCycle:'h23'
  });
  const parts=formatter.formatToParts(at);
  const nowHour=Number(parts.find(x=>x.type==='hour')?.value);
  const nowMinute=Number(parts.find(x=>x.type==='minute')?.value);
  if(!Number.isFinite(nowHour)||!Number.isFinite(nowMinute))return null;
  const age=((nowHour*60+nowMinute)-(hour*60+minute)+1440)%1440;
  // The date isn't supplied. Never mistake yesterday's listing for today's.
  // The UI always says "Dernier titre diffusé", never "En ce moment".
  if(age>180)return null;
  const result={title,artist,playedAt:String(hour).padStart(2,'0')+':'+matchTime[2]};
  const rawCover=slide.match(/\bdata-lazy-src=["']([^"']+)["']/i)?.[1]
    ?? slide.match(/<img\b[^>]*\bsrc=["'](https:\/\/[^"']+)["']/i)?.[1];
  const cover=radioArtworkUrl(decode(rawCover??''));
  if(cover&&!new URL(cover).pathname.endsWith('/nova-default.png'))result.artwork=cover;
  return result;
}
