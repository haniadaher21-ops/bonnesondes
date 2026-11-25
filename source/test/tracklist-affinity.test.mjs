import assert from 'node:assert/strict';
import {test} from 'node:test';
import {emptyTasteProfile} from '../editorial/taste-profile.mjs';
import {buildArtistAffinity,mixTracklistAffinity} from '../scripts/tracklist-affinity.mjs';
import {weeklyShortlist} from '../scripts/weekly-ranking.mjs';

const now=new Date('2026-11-25T09:00:00Z');
const profile={...emptyTasteProfile(),favoriteArtists:['Cleo Sol','SAULT','Air'],signals:{curators:[],items:[
 {id:'liked',saved:true,reaction:'Loved',creator:'Sade'},
 {id:'disliked',saved:false,reaction:'Not for me',creator:'Other Artist'},
 {id:'dj',saved:true,reaction:'Loved',creator:'DJ Example'},
]}};
const known=[
 {id:'liked',creator:'Sade',format:'Album'},
 {id:'disliked',creator:'Other Artist',format:'Live session'},
 {id:'dj',creator:'DJ Example',format:'Radio show'},
];
const index=buildArtistAffinity(profile,known);
const track=(artist,title='Song')=>({artist,title});
const mix=(id,tracks)=>({id,title:id,format:'Radio show',source:'NTS Radio',provider:'NTS',sourceId:'nts-example',
 mixKind:'dj-set',date:'2026-11-24',verificationStatus:'source-verified',
 sourceUrl:'https://www.nts.live/shows/example',url:'https://www.nts.live/shows/example/episodes/'+id,
 tracklist:{status:'available',method:'nts-api',checkedAt:now.toISOString(),
 sourceUrl:'https://www.nts.live/api/v2/shows/example/episodes/'+id+'/tracklist',tracks}});
test('exact verified artists, not substrings, DJs or arbitrary unknown artists',()=>{
 const result=mixTracklistAffinity(mix('test',[track('CLEO SOL'),track('Sade'),track('Other Artist'),track('Air Supply'),track('DJ Example'),track('Unknown Band')]),index,now);
 assert.equal(result.favorites,1);assert.equal(result.liked,1);assert.equal(result.disliked,1);
 assert.equal(result.unknown,3);assert.equal(result.points,14);
});
test('repeat tracks by the same artist do not inflate the bonus; bounds protect discovery',()=>{
 const a=mixTracklistAffinity(mix('a',[track('SAULT'),track('Sade')]),index,now);
 const b=mixTracklistAffinity(mix('b',[track('SAULT'),track('SAULT','Another'),track('Sade')]),index,now);
 assert.equal(a.points,b.points);
 const big={...emptyTasteProfile(),favoriteArtists:Array.from({length:30},(_,i)=>'Artist '+i)};
 assert.equal(mixTracklistAffinity(mix('many',big.favoriteArtists.map(x=>track(x))),buildArtistAffinity(big,[]),now).points,48);
});
test('absent, unrelated, expired or ambiguous evidence cannot affect the score',()=>{
 const item=mix('test',[track('Cleo Sol'),track('SAULT')]);
 for(const wrong of [
  {...item,tracklist:undefined},
  {...item,tracklist:{...item.tracklist,status:'ambiguous'}},
  {...item,tracklist:{...item.tracklist,sourceUrl:'https://www.nts.live/api/v2/shows/example/episodes/other/tracklist'}},
  {...item,tracklist:{...item.tracklist,checkedAt:'2026-10-01T09:00:00Z'}},
  {...item,format:'Album'},
 ])assert.equal(mixTracklistAffinity(wrong,index,now).points,0);
 assert.equal(mixTracklistAffinity(mix('unknown',[track('Unknown Band'),track('Other Band')]),index,now).points,0);
});
test('ranking favors the matching mix, and identical-profile baseline is unchanged',()=>{
 const candidates=[mix('a',[track('Other Band'),track('Different Band')]),mix('z',[track('Cleo Sol'),track('SAULT')])];
 const options={candidates,profile,earlier:[],catalog:known,startsOn:'2026-11-30',now};
 const before=weeklyShortlist({...options,tracklistWeight:0});
 const after=weeklyShortlist(options);
 assert.equal(before.selected.nts[0].item.id,'a');
 assert.equal(after.selected.nts[0].item.id,'z');
 assert.equal(after.rankings.find(x=>x.item.id==='a').score,before.rankings.find(x=>x.item.id==='a').score);
 const neutral=weeklyShortlist({...options,profile:emptyTasteProfile()});
 assert.equal(neutral.selected.nts[0].item.id,'a');
});
test('a tracklist cannot override eligibility gates',()=>{
 const rejected={...mix('test',[track('Cleo Sol'),track('SAULT')]),title:'Jazz mix'};
 const result=weeklyShortlist({candidates:[rejected],profile,earlier:[],catalog:[],startsOn:'2026-11-30',now});
 assert.equal(result.rankings.length,0);
 assert.equal(result.rejected.length,1);
});
