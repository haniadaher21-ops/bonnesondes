import {test} from 'node:test';
import assert from 'node:assert/strict';
import {makeWeightedAffinity,weightedAffinity,compareWeightedRanking} from '../scripts/weighted-affinity.mjs';
import {resolveIdentity,parseNeighbors,enrichPublicArtists} from '../scripts/public-artist-metadata.mjs';
const a='11111111-1111-1111-1111-111111111111',b='22222222-2222-2222-2222-222222222222';
const index=makeWeightedAffinity({artists:[{artist:'Example A',score:100},{artist:'Blocked',score:99}],excluded_artists:['Blocked']});
const metadata=new Map([['example b',{status:'verified',mbid:b,neighbors:[{artist:'Example A',mbid:a}]}]]);
test('direct affinity is bounded, deduplicated and unknown neutral',()=>{
 assert.equal(weightedAffinity(['Example A','example a'],index).points,30);
 assert.equal(weightedAffinity(['Unknown'],index).points,0);
 assert.equal(weightedAffinity(['Example A','Unknown'],index).points,15);
});
test('related artist has a weaker bonus; missing evidence neutral',()=>{
 assert.equal(weightedAffinity(['Example B'],index,metadata).points,16.5);
 assert.equal(weightedAffinity(['Example B'],index).points,0);
});
test('blocked artist overrides any positive affinity',()=>assert.equal(weightedAffinity(['Example A','Blocked'],index).excluded,true));
test('same candidates re-ranked without changing baseline',()=>{
 const r=compareWeightedRanking([{id:'x',score:50,artists:['Unknown']},{id:'y',score:40,artists:['Example B']}],index,metadata);
 assert.equal(r.before[0].id,'x');assert.equal(r.after[0].id,'y');
});
test('identity ambiguity rejected; unrelated response rows ignored',()=>{
 const artist={id:a,name:'Example A',score:100};
 assert.equal(resolveIdentity('Example A',{count:1,artists:[artist]}),a);
 assert.equal(resolveIdentity('Example A',{count:2,artists:[artist,{...artist,id:b}]}),null);
 assert.deepEqual(parseNeighbors(a,{[a]:[],[b]:[{similar_artist_mbid:b,similar_artist_name:'Example B'}]}),[{artist:'Example B',mbid:b}]);
});
test('public lookup uses only candidate names and caches resolved responses',async()=>{
 const urls=[];const cache=new Map();
 const fetcher=async url=>{urls.push(url);return {ok:true,json:async()=>url.includes('musicbrainz.org')?{count:1,artists:[{id:a,name:'Example A',score:100}]}:{[b]:[{similar_artist_mbid:b,similar_artist_name:'Example B'}]}}};
 const opts={fetcher,cache,pause:async()=>{}};
 const first=await enrichPublicArtists(['Example A','example a'],opts);
 assert.equal(first.get('example a').status,'verified');
 await enrichPublicArtists(['Example A'],opts);
 assert.equal(urls.length,2);
});
test('network errors are neutral and retriable',async()=>{
 const r=await enrichPublicArtists(['Example A'],{fetcher:async()=>{throw Error('offline')},pause:async()=>{}});
 assert.equal(r.get('example a').status,'unavailable');
});
