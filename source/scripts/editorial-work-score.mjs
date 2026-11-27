import {musicalTags,styleAgreement} from './style-affinity.mjs';
import {editorialEndorsement} from './recommendation-policy.mjs';
const clamp=x=>Math.min(1,Math.max(0,Number.isFinite(x)?x:0));
// Work tags are from the verified release or explicitly documented channel,
// never from the artist's general co-listening profile.
export function editorialWorkScore(item,{styles=[],affinity,known,now=new Date()}){
  const tags=musicalTags(item.tags);
  const match=styles.map(s=>({weight:clamp(s.score/100),agreement:styleAgreement(tags,[s.tag])}))
    .map(x=>x.weight*({specific:1,family:.6,different:0,unknown:0}[x.agreement]??0))
    .sort((a,b)=>b-a);
  const style=Math.min(1,(match[0]??0)+.10*(match[1]??0));
  const editorial=editorialEndorsement(item);
  const quality=editorial?.kind==='critic-pick'||['Album of the Week','Album of the Day'].includes(editorial?.claim)?1:editorial?.kind==='curator-pick' ? .8 : 0;
  const age=(+now-Date.parse(item.releaseDate??item.date))/86400000;
  const freshness=Number.isFinite(age)&&age>=0?clamp(1-age/14):0;
  const discovery=!known&&(style>0||affinity?.corroborated>0)?1:0;
  const points=35*style+25*quality+20*clamp((affinity?.points??0)/30)+10*discovery+10*freshness;
  return {points:Math.round(points*100)/100,styleEvidence:tags.length>0,styleMatch:style,quality,discovery,freshness};
}
