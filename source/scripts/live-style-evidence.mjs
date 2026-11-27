// Conservative extraction of explicitly documented musical styles from the
// official performance description. No inference from channel, names of other
// artists, promotions, or comparisons. Keep only the matching genre labels.
const genres=['alternative r&b','contemporary r&b','neo soul','r&b','soul','funk','disco','indie pop','dream pop','art pop','alternative pop','synthpop','synth pop','hyperpop','dance pop','pop','indie rock','psychedelic rock','garage rock','alternative rock','rock','post punk','indie folk','folk rock','folk','country','hip hop','alternative hip hop','cloud rap','grime','rap','reggae','dub','afrobeats','afrobeat','latin pop','reggaeton','bossa nova','house','deep house','downtempo','trip hop','ambient','electronic','techno','drum and bass','jazz','blues'];
const normalize=s=>String(s??'').normalize('NFKC').toLowerCase().replace(/[-–—]/g,' ').replace(/\s+/g,' ').trim();
const escape=s=>s.replace(/[.*+?^\${}()|[\]\\]/g,'\\$&');
export function officialLiveGenres(description,artist){
 const who=normalize(artist);
 if(who.length<3||typeof description!=='string')return [];
 const output=new Set();
 const subject=new RegExp('(?:^|[^\\p{L}\\p{N}])'+escape(who)+'(?:[’\\x27]s)?\\s+(?:is|are|has|have|blends?|mix(?:es)?|combines?|fuses?|draws?|weaves?|brings?|merges?|makes?|delivers?|performs?|plays?|creates?|explores?|embraces?|crafts?|channels?|moves?)\\b','iu');
 for(const line of description.slice(0,3500).split(/[\n.!?]+/)){
  const s=normalize(line);
  if(!s||s.length>550||!subject.test(s)||/\b(?:subscribe|follow us|tickets|playlist|copyright|sponsor|merch|other artists|for fans of|sounds like|compared to|not|never|unlike|rather than)\b/i.test(s))continue;
  const clause=s.slice(s.search(subject));
  // Discard social, URL and credit lines; don't use styles mentioned in
  // a comparison, a cover's original artist or another artist's biography.
  if(/https?:|@|\b(?:cover of|originally by|featuring|similar to|inspired by|influenced by)\b/i.test(clause))continue;
  for(const g of genres){
   const n=normalize(g);
   if(new RegExp('(?:^|[^\\p{L}\\p{N}])'+escape(n)+'(?:$|[^\\p{L}\\p{N}])','iu').test(clause))output.add(g);
  }
 }
 return [...output].slice(0,12);
}
