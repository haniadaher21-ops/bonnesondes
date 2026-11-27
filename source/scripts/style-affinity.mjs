// Conservative, explicit taxonomy: only musical tags, not countries, eras or moods.
const families={
  rnb:['rnb','r&b','rhythm and blues','alternative r&b','contemporary r&b','neo soul','neo-soul','soul','quiet storm','new jack swing','soul pop','funk','psychedelic soul'],
  pop:['pop','pop rock','dance pop','dance-pop','art pop','synthpop','synth pop','hyperpop','electropop','alternative pop','indie pop','dream pop','bedroom pop','chillwave'],
  indie:['indie','indie rock','indie pop','alternative rock','post punk','post-punk','dream pop','shoegaze','psychedelic rock','garage rock','lo fi','lo-fi','folk rock','indie folk','art rock','chillwave'],
  rap:['hip hop','hip-hop','rap','alternative hip hop','conscious hip hop','trap','cloud rap','french hip hop','uk hip hop','boom bap','grime','gangsta rap'],
  folk:['folk','indie folk','singer songwriter','singer-songwriter','country','americana','folk rock','acoustic'],
  dance:['house','deep house','garage house','uk garage','disco','nu disco','funky house','soulful house','dance','uk funky','broken beat'],
  electronic:['electronic','electronica','ambient','downtempo','trip hop','trip-hop','idm','experimental electronic','techno','drum and bass','dubstep','breakbeat','chillwave','synthpop','electropop','hyperpop'],
  jazz:['jazz','jazz fusion','bebop','smooth jazz','hard bop','free jazz','nu jazz'],
  latin:['latin','latin pop','reggaeton','bossa nova','samba','cumbia','salsa','latin jazz','bolero'],
  afro:['afrobeats','afrobeat','afropop','amapiano','afro house','highlife','afro soul'],
  classical:['classical','modern classical','contemporary classical','minimalism','neoclassical'],
  rock:['rock','alternative rock','indie rock','post punk','post-punk','psychedelic rock','pop rock','garage rock','hard rock','metal','punk'],
  blues:['blues','blues rock','soul blues','rhythm and blues'],
};
const norm=x=>typeof x==='string'?x.normalize('NFKC').toLowerCase().trim().replace(/[-_]+/g,' ').replace(/\s+/g,' '):'';
const aliases=new Map([['r&b','rnb'],['rhythm and blues','rnb'],['hip hop','hip hop'],['synth pop','synthpop']]);
const canonical=x=>aliases.get(norm(x))??norm(x);
const familyMap=new Map();
for(const [family,values] of Object.entries(families))for(const raw of values){
 const tag=canonical(raw);const set=familyMap.get(tag)??new Set();set.add(family);familyMap.set(tag,set);
}
const broad=new Set(['pop','rock','electronic','indie','dance','hip hop','rap','classical','latin']);
export function musicalTags(tags){return [...new Set((Array.isArray(tags)?tags:[]).map(canonical).filter(t=>familyMap.has(t)))];}
export function styleAgreement(left,right){
 const a=musicalTags(left),b=musicalTags(right);
 if(!a.length||!b.length)return 'unknown';
 const common=a.filter(t=>b.includes(t));
 if(common.some(t=>!broad.has(t)))return 'specific';
 const fa=new Set(a.flatMap(t=>[...familyMap.get(t)])),fb=new Set(b.flatMap(t=>[...familyMap.get(t)]));
 if(common.length||[...fa].some(t=>fb.has(t)))return 'family';
 return 'different';
}
export function corroboratedNeighborScore(neighbors){
 // Co-listening alone is a weak signal; disjoint documented genres do not
 // contribute. Distinct corroborated neighbors support, but cannot overwhelm.
 const byId=new Map();
 for(const n of neighbors){
  const factor={specific:.55,family:.35,unknown:.12,different:0}[n.agreement]??0;
  const value=factor*n.weight;
  if(value>(byId.get(n.id)?.value??0))byId.set(n.id,{value,agreement:n.agreement});
 }
 const ranked=[...byId.values()].sort((a,b)=>b.value-a.value);
 const confirmed=ranked.filter(n=>['specific','family'].includes(n.agreement));
 const max=ranked[0]?.value??0;
 return {value:Math.min(65,max+0.15*(confirmed[1]?.value??0)+0.08*(confirmed[2]?.value??0)),corroborated:confirmed.length>0,confirmed:confirmed.length};
}
