// Nova podcasts are not automatically DJ sets. Explicitly identify
// fully musical programmes, and never treat a talk episode as a mix.
const spoken=/\b(?:interview|entretien|rencontre|actualité|actus?|news|invit[ée]s?|on parle|discussions?|chronique|les disques de sa vie|le juke-box)\b/i;
export function isDedicatedNovaMixEpisode(title,selection) {
  if(typeof title!=='string'||!title.trim()||spoken.test(title))return false;
  switch(selection){
    case 'nova-club-exclusively-mixed':
      return /^(?:tout en mix\b|mix\s+(?:de|par|exclusif|bob\b)|dj\s*set\b|session\s*(?:dj|mix)\b)/i.test(title)
        || /\b(?:aux platines|100%\s*mix)\b/i.test(title);
    case 'neo-geo-worldmix':
      return /\bworldmix\b/i.test(title);
    case 'teuf-dappart':
      return /^(?:teuf\s+d.appart\b|manège à trois invite\b)/i.test(title);
    default:return false;
  }
}
