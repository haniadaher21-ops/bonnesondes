import {musicalTags,styleAgreement} from './style-affinity.mjs';
import {editorialEndorsement,isNtsMix,isNovaMix,isFipTape,isYouTubeMix} from './recommendation-policy.mjs';
const clamp=x=>Math.min(1,Math.max(0,Number.isFinite(x)?x:0));
const key=x=>String(x??'').normalize('NFKC').toLowerCase().trim().replace(/\s+/gu,' ');
const mixTags={rnb:'rnb',soul:'soul',blues:'blues',pop:'pop','light-house':'house',funk:'funk'};
function styleFit(tags,styles){
  const scores=styles.map(s=>({weight:clamp(s.score/100),agreement:styleAgreement(tags,[s.tag])}))
    .map(x=>x.weight*({specific:1,family:.6,different:0,unknown:0}[x.agreement]??0))
    .sort((a,b)=>b-a);
  return clamp((scores[0]??0)+.10*(scores[1]??0));
}
// Generic tags alone cannot establish close affinity for an unfamiliar album.
const broadAlbumTags=new Set(['pop','rock','electronic','indie','dance','hip hop','rap','classical','latin']);
function albumStyleFit(tags,styles){
  const precise=tags.filter(t=>!broadAlbumTags.has(t));
  if(!precise.length)return Math.min(.18,styleFit(tags,styles)*.25);
  const scores=styles.map(s=>{
    const agreement=styleAgreement(precise,[s.tag]);
    return clamp(s.score/100)*({specific:1,family:.45,different:0,unknown:0}[agreement]??0);
  }).sort((a,b)=>b-a);
  return clamp((scores[0]??0)+.08*(scores[1]??0));
}
// Only episode / release / performance tags and independently enriched track
// credits. Never substitute the channel or DJ's own artist style for the set.
export function editorialWorkScore(item,{styles=[],affinity,known,now=new Date(),credits=[],metadata=new Map(),knownArtists=new Set(),tracklistVerified=false}={}){
  const tags=musicalTags([...(item.tags??[]),...(isYouTubeMix(item)&&mixTags[item.mixStyle]?[mixTags[item.mixStyle]]:[])]);
  const mix=item.format==='Radio show',live=item.format==='Live session';
  const names=[...new Set(credits.map(key).filter(Boolean))];
  const documented=names.flatMap(name=>{
    const row=metadata.get(name);
    return ['verified','identity'].includes(row?.status)&&musicalTags(row.tags).length?[{name,fit:styleFit(musicalTags(row.tags),styles)}]:[];
  });
  const album=item.format==='Album';
  const explicitFit=album?albumStyleFit(tags,styles):styleFit(tags,styles);
  let style=explicitFit;
  if(mix&&tracklistVerified&&documented.length){
    // Coverage-weighted average: one artist does not define a long mix.
    const trackFit=documented.reduce((sum,row)=>sum+row.fit,0)/Math.max(1,names.length);
    style=tags.length ? .75*explicitFit+.25*trackFit:trackFit;
  }
  // An artist's genres are a weaker proxy for a specific performance.
  if(live&&!tags.length&&documented.length)style=.6*documented.reduce((s,r)=>s+r.fit,0)/Math.max(1,names.length);
  const editorial=editorialEndorsement(item);
  let quality=editorial?.kind==='critic-pick'||['Album of the Week','Album of the Day'].includes(editorial?.claim)?1:editorial?.kind==='curator-pick' ? .8:0;
  if(live)quality=item.verificationStatus==='performance-verified'&&item.officialVideo===true ? .8:0;
  if(mix)quality=(isNtsMix(item)||isNovaMix(item)||isFipTape(item)||isYouTubeMix(item))&&['source-verified','editor-verified'].includes(item.verificationStatus)?(.75+(tracklistVerified ? .25:0)):0;
  const age=(+now-Date.parse(item.releaseDate??item.date))/86400000;
  const window=live?90:mix?(item.mixKind==='curated-mix'?365:14):14;
  const freshness=Number.isFinite(age)&&age>=0?clamp(1-age/window):0;
  const newFraction=names.length?names.filter(n=>!knownArtists.has(n)).length/names.length:0;
  const supportedNew=mix&&tracklistVerified&&names.length>=2&&(explicitFit>=.35||documented.some(r=>r.fit>=.35));
  const artistFit=clamp((affinity?.points??0)/30);
  const tasteSupported=style>=.33||artistFit>=.20;
  const discovery=album?(!known&&tasteSupported&&(style>=.33||affinity?.corroborated>0)?1:0):mix?(supportedNew?newFraction:0):(!known&&(style>0||affinity?.corroborated>0)?1:0);
  const points=album?50*style+25*artistFit+15*quality+5*discovery+5*freshness:35*style+25*quality+20*artistFit+10*discovery+10*freshness;
  return {points:Math.round(points*100)/100,styleEvidence:tags.length>0,styleMatch:style,artistFit,tasteSupported,quality,discovery,freshness,documentedCredits:documented.length,totalCredits:names.length};
}
