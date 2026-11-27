import {enrichPublicArtists} from './public-artist-metadata.mjs';
import {enrichRadioTracklists} from './mix-tracklists.mjs';
import {publicArtistQueue} from './weighted-weekly.mjs';
const now=new Date('2026-11-27T12:00:00Z');
const albums=['Toro y Moi','Lorenzo Senni','Donato Dozzy','Atlas Sound']; // Pitchfork Nov 20, 2026; Lambchop is an EP
const shows=[['guests','habashi-25th-november-2026','Habashi','2026-11-24'],['prosumer','prosumer-24th-november-2026','Prosumer w/ Maze','2026-11-24'],['mark-leckey','mark-leckey-24th-november-2026','Mark Leckey - Imaginal Discs','2026-11-24'],['early-bird-show-w-pam','early-bird-show-w-pam-26th-november-2026','The Early Bird Show w/ PAM & TM','2026-11-26']];
const mixes=shows.map(([show,id,title,date])=>({id,title,date,format:'Radio show',mixKind:'dj-set',source:'NTS',url:'https://www.nts.live/shows/'+show+'/episodes/'+id}));
const {items,diagnostics}=await enrichRadioTracklists(mixes,{now});
const names=[...albums,...publicArtistQueue(items.map(item=>({item})),now)];
const fetcher=async (url,options)=>{const response=await fetch(url,options);console.log('BO_PUBLIC_HTTP '+new URL(url).hostname+' '+response.status);return response;};
const data=await enrichPublicArtists(names,{limit:12,fetcher});
console.log('BO_PUBLIC_TRACKS '+JSON.stringify(items.map(x=>({id:x.id,title:x.title,date:x.date,url:x.url,tracks:x.tracklist?.tracks?.map(t=>t.artist)??[]}))));
for(const [name,row] of data)console.log('BO_PUBLIC_METADATA '+JSON.stringify({name,...row}));
console.log('BO_PUBLIC_SUMMARY '+JSON.stringify({diagnostics,requested:data.size,verified:[...data.values()].filter(x=>x.status==='verified').length}));
