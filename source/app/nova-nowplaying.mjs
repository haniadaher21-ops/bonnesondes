// Nova's public "C'était quoi ce titre" listings: parse only the first verified
// slide returned by the HTTPS Jina Reader, never an unrelated search result.
// The listing is a recent broadcast, not guaranteed to match live audio exactly.
const decode = text => text.replace(/&(?:#(x[0-9a-f]+|[0-9]+)|amp|lt|gt|quot|apos|nbsp);/gi,(entity,number)=>{
  if(number){
    const code=number[0].toLowerCase()==='x'?parseInt(number.slice(1),16):parseInt(number,10);
    return Number.isFinite(code)&&code>0&&code<=0x10ffff?String.fromCodePoint(code):'';
  }
  return ({'&amp;':'&','&lt;':'<','&gt;':'>','&quot;':'"','&apos;':"'",'&nbsp;':' '})[entity.toLowerCase()]??entity;
}).replace(/\s+/g,' ').trim();

export function parseNovaNowPlaying(html, at = new Date()) {
  if(typeof html!=='string'||html.length>20000||!html.includes('wwtt_content'))return null;
  const matchTime=html.match(/<p\s+class=["']time["']\s*>\s*([0-2]?\d):([0-5]\d)\s*<\/p>/i);
  const matchTitle=html.match(/<h2\b[^>]*>\s*<a\b[^>]*>([^<]+)<\/a>\s*<\/h2>\s*<p\b[^>]*>([^<]+)<\/p>/i);
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
  // A stale page must never be presented as the song on air.
  if(age>12)return null;
  return {title,artist,playedAt:String(hour).padStart(2,'0')+':'+matchTime[2]};
}
