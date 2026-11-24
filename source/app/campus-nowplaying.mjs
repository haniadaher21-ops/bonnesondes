// Parses broadcaster-provided metadata, not arbitrary music search results.
// Unverifiable or stale titles must never be called "now playing".
const normalize = value => String(value ?? '').replace(/\s+/g,' ').trim();
const safeArtwork = url => {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password ||
      /\/placeholders?\//i.test(parsed.pathname)) return undefined;
    return parsed.href;
  } catch { return undefined; }
};

function ageMinutes(localTime, timezone, now) {
  const expected = new Intl.DateTimeFormat('en-US', {
    timeZone:timezone,hour:'numeric',minute:'2-digit',hour12:true,
  }).format(now).replace(/\u202f/g,' ').replace(/\s+/g,' ').trim();
  const parse = value => {
    const match=String(value).replace(/\u202f/g,' ').match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
    if (!match) return undefined;
    return Number(match[1])%12*60+Number(match[2])+(match[3].toUpperCase()==='PM'?720:0);
  };
  const clock=parse(localTime), current=parse(expected);
  if (clock===undefined || current===undefined) return Infinity;
  return (current-clock+1440)%1440;
}

// Jina's reader turns public Spinitron playlist tables into timestamped entries
// with the original cover URLs. This is only used on three specified stations.
export function parseSpinitronReader(text, timezone, now=new Date()) {
  if (typeof text!=='string' || !text.includes('Markdown Content:')) return null;
  const markdown=text.slice(text.indexOf('Markdown Content:')+'Markdown Content:'.length);
  // The same clock time occurs every day. Match the actual station-local
  // broadcast date, otherwise a cached page from yesterday could look live.
  const stationDate=new Intl.DateTimeFormat('en-US',{
    timeZone:timezone,month:'short',day:'numeric',year:'numeric',
  }).format(now);
  const header=markdown.split(/\[\d{1,2}:\d{2}\s*[AP]M\]\(/)[0];
  if (!header.includes(stationDate)) return null;
  const rows=markdown.matchAll(/\[(\d{1,2}:\d{2}\s*[AP]M)\]\(https:\/\/[^)\s]+\/pl\/[^)]+[?&]sp=\d+\)!\[Image\s+\d+:\s*([^\]]+)\]\((https:\/\/[^)\s]+)\)/g);
  for (const row of rows) {
    const age=ageMinutes(row[1],timezone,now);
    if (age>45) return null;
    const separator=row[2].indexOf(' - ');
    if (separator<=0) return null;
    const artist=normalize(row[2].slice(0,separator));
    const title=normalize(row[2].slice(separator+3));
    if(!artist || !title || /^(unknown|station|no title)$/i.test(title)) return null;
    return {title,artist,artwork:safeArtwork(row[3]),kind:'last-confirmed',playedAt:row[1].trim()};
  }
  return null;
}

export function parseCampusParisReader(text, now=new Date()) {
  if(typeof text!=='string' || !text.includes('Markdown Content:')) return null;
  const markdown=text.slice(text.indexOf('Markdown Content:')+'Markdown Content:'.length);
  const anchor=markdown.indexOf("C’était quoi ce morceau ?");
  const section=anchor<0?markdown:markdown.slice(anchor);
  const match=section.match(/!\[Image\s+\d+:\s*([^\]]+)\]\((https:\/\/[^)\s]+)\)([\s\S]{0,330})/);
  if(!match) return null;
  const separator=match[1].indexOf(' - ');
  if(separator<1) return null;
  const artist=normalize(match[1].slice(0,separator));
  const title=normalize(match[1].slice(separator+3));
  if(!artist || !title) return null;
  const time=match[3].match(/\b(\d{2}:\d{2})\b/)?.[1];
  if(!time) return null;
  const local=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Paris',hour:'2-digit',minute:'2-digit',hour12:false}).format(now);
  const toMinute=clock=>Number(clock.split(':')[0])*60+Number(clock.split(':')[1]);
  if((toMinute(local)-toMinute(time)+1440)%1440>45) return null;
  return {title,artist,artwork:safeArtwork(match[2]),kind:'last-confirmed',playedAt:time};
}

export function parseRadioCultLive(payload) {
  if (!payload || payload.success!==true || !payload.result || payload.result.status==='offAir') return null;
  const data=payload.result;
  const recognized=data.musicRecognition?.status==='match' ? data.musicRecognition : null;
  const metadata=recognized ?? data.metadata;
  if (!metadata || typeof metadata.title!=='string' || typeof metadata.artist!=='string') return null;
  const title=normalize(metadata.title), artist=normalize(metadata.artist);
  if(!title || !artist || /^(unknown|live|stream|radio|on air)$/i.test(title))return null;
  const art=metadata.artwork;
  const artwork=safeArtwork(typeof art==='string' ? art : art?.['256x256'] ?? art?.default ?? art?.original);
  return {title,artist,artwork,kind:'live'};
}


// KCRW publishes an official cross-channel JSON history. Filter strictly to
// Eclectic24, use broadcaster timestamps and official artwork, and reject
// stale/missing/invalid metadata. Never infer an exact Spotify track ID.
export function parseKcrwNowPlaying(payload, now=new Date()) {
  if(!Array.isArray(payload)) return null;
  const recent=payload.filter(row=>row && row.program_id==='e24'
    && typeof row.title==='string' && typeof row.artist==='string'
    && typeof row.datetime==='string').map(row=>({
      row,age:now.getTime()-Date.parse(row.datetime),
    })).filter(item=>Number.isFinite(item.age) && item.age>=-120_000 && item.age<=40*60_000)
    .sort((a,b)=>a.age-b.age)[0];
  if(!recent) return null;
  const row=recent.row;
  const title=normalize(row.title),artist=normalize(row.artist);
  if(!title||!artist || /^(unknown|on air|advertisement|music|station)$/i.test(title)) return null;
  return {
    title,artist,artwork:safeArtwork(row.albumImageLarge)||safeArtwork(row.albumImage),
    kind:'last-confirmed',playedAt:normalize(row.time),
  };
}
