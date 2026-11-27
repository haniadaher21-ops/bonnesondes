import {musicalTags} from './style-affinity.mjs';
// Extract documented styles, not listening guesses or artists mentioned.
const styles=/\b(?:alternative\s+r\s*&\s*b|contemporary\s+r\s*&\s*b|neo[- ]?soul|r\s*&\s*b|rnb|soul|funk|boogie|broken[- ]beat|dream[- ]pop|indie[- ]pop|art[- ]pop|alternative[- ]pop|hyperpop|synth[- ]?pop|indie[- ]rock|psychedelic[- ]rock|indie[- ]folk|folk|hip[- ]hop|grime|rap|afrobeats|reggaeton|blues|disco|soulful[- ]house|deep[- ]house|trip[- ]hop|downtempo|bossa[- ]nova|ambient|pop)\b/gi;
const clean=s=>String(s??'').replace(/<[^>]+>/g,' ').replace(/&amp;/gi,'&').replace(/&nbsp;/gi,' ').replace(/\s+/g,' ').trim();
const negative=/\b(?:no|not|never|sans|pas de|rather than|unlike|for fans of|compared to|sounds like)\b/i;
export function documentedMixStyles({title='',tags=[],description=''}={}){
 const lines=[clean(title),...tags.filter(x=>typeof x==='string').map(clean)];
 for(const line of String(description).slice(0,2000).split(/[\n.!?]+/)){
  const s=clean(line);
  if(s.length>250||!/\b(?:genres?|styles?|selection|sélection|mix|set|platines|sounds|sonorités|blend|mélange|entre|explore|explore[s]?|voyage musical)\b/i.test(s))continue;
  if(/https?:|@|\b(?:subscribe|abonnez|follow|merch|copyright|playlist link|sponsor)\b/i.test(s))continue;
  lines.push(s);
 }
 const matches=[];
 for(const line of lines)if(!negative.test(line))matches.push(...(line.match(styles)??[]).map(x=>x.toLowerCase().replace(/r\s*&\s*b/g,'r&b').replace(/neo[- ]?soul/g,'neo soul')));
 return musicalTags(matches);
}
