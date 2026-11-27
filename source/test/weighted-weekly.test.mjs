import {test} from 'node:test';
import assert from 'node:assert/strict';
import {emptyTasteProfile} from '../editorial/taste-profile.mjs';
import {weeklyShortlist,candidateArtistCredits} from '../scripts/weekly-ranking.mjs';
import {compareWeeklyWeighted,publicArtistQueue} from '../scripts/weighted-weekly.mjs';

const now=new Date('2026-11-25T09:00:00Z');
const track=artist=>({artist,title:'Title'});
const mix=(id,artists)=>({id,title:id,format:'Radio show',source:'NTS Radio',provider:'NTS',sourceId:'nts-example',mixKind:'dj-set',date:'2026-11-24',verificationStatus:'source-verified',sourceUrl:'https://www.nts.live/shows/example',url:'https://www.nts.live/shows/example/episodes/'+id,tracklist:{status:'available',method:'nts-api',checkedAt:now.toISOString(),sourceUrl:'https://www.nts.live/api/v2/shows/example/episodes/'+id+'/tracklist',tracks:artists.map(track)}});
const candidates=[mix('a',['Unknown A','Unknown B']),mix('z',['Example A','Example B'])];
const profile=emptyTasteProfile(),weightedProfile={artists:[{artist:'Example A',score:100}],excluded_artists:[]};
const options={candidates,profile,earlier:[],catalog:[],startsOn:'2026-11-30',now};
test('real weekly selection uses weighted scores only when enabled',()=>{
 const old=weeklyShortlist(options),off=weeklyShortlist({...options,weightedProfile}),on=weeklyShortlist({...options,weightedProfile,weightedWeight:1});
 assert.deepEqual(old,off);
 assert.equal(old.selected.nts[0].item.id,'a');
 assert.equal(on.selected.nts[0].item.id,'z');
 assert.equal(on.rankings[0].weightedAffinity.points,15);
 assert.equal(on.rankings[0].publicReason,old.rankings.find(x=>x.item.id==='z').publicReason);
 assert.equal(on.rankings[0].reason,old.rankings.find(x=>x.item.id==='z').reason);
});
test('unverified tracklist and playlist curator never contribute',()=>{
 assert.deepEqual(candidateArtistCredits({...candidates[1],tracklist:{...candidates[1].tracklist,status:'ambiguous'}},now),[]);
 assert.deepEqual(candidateArtistCredits({format:'Playlist',creator:'Example A'},now),[]);
});
test('blocked artist cannot be ranked, eligibility unchanged',()=>{
 const report=weeklyShortlist({...options,candidates:[...candidates,{...candidates[1],id:'bad',title:'Jazz mix'}],weightedProfile:{...weightedProfile,excluded_artists:['Example A']},weightedWeight:1});
 assert.deepEqual(report.rankings.map(x=>x.item.id),['a']);
 assert.equal(report.rejected.length,2);
});
test('public lookup order is independent of private profile and fair across tracklists',async()=>{
 const rows=candidates.map(item=>({item}));
 assert.deepEqual(publicArtistQueue(rows,now),['Unknown A','Example A','Unknown B','Example B']);
 const urls=[];
 const fetcher=async url=>{urls.push(url);return {ok:true,json:async()=>({count:0,artists:[]})}};
 const result=await compareWeeklyWeighted({options,weightedProfile,publicCandidates:[candidates[0]],fetcher,pause:async()=>{},limit:10});
 assert.equal(urls.length,2);
 assert.ok(urls.every(u=>!decodeURIComponent(u).includes('Example')));
 assert.equal(result.before.selected.nts[0].item.id,'a');
 assert.equal(result.after.selected.nts[0].item.id,'z');
});
