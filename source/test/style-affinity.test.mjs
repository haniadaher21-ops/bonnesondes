import assert from 'node:assert/strict';
import {test} from 'node:test';
import {styleAgreement,musicalTags,corroboratedNeighborScore} from '../scripts/style-affinity.mjs';
import {makeWeightedAffinity,weightedAffinity} from '../scripts/weighted-affinity.mjs';
import {enrichPublicArtists} from '../scripts/public-artist-metadata.mjs';

const a='11111111-1111-1111-1111-111111111111',b='22222222-2222-2222-2222-222222222222',c='33333333-3333-3333-3333-333333333333';
test('tags are musical, normalized and specificity matters',()=>{
 assert.deepEqual(musicalTags(['France','2020s','neo-soul','Neo Soul']),['neo soul']);
 assert.equal(styleAgreement(['neo-soul'],['neo soul']),'specific');
 assert.equal(styleAgreement(['dream pop'],['indie rock']),'family');
 assert.equal(styleAgreement(['ambient'],['hip hop']),'different');
 assert.equal(styleAgreement(['ambient'],['France']),'unknown');
});
test('strong co-listening alone cannot outweigh supported genre match',()=>{
 const index=makeWeightedAffinity({artists:[{artist:'A',score:100},{artist:'B',score:60}],known_artist_names:['A','B']});
 const m=new Map([['new',{status:'verified',mbid:c,tags:['dream pop'],neighbors:[{artist:'A',mbid:a,tags:['hip hop']},{artist:'B',mbid:b,tags:['dream pop']}]}]]);
 const confirmed=weightedAffinity(['New'],index,m);
 assert.equal(confirmed.points,11.4);
 assert.equal(confirmed.corroborated,1);
 m.get('new').neighbors[1].tags=[];
 assert.equal(weightedAffinity(['New'],index,m).points,2.16);
 m.get('new').neighbors[1].tags=['rap'];
 assert.equal(weightedAffinity(['New'],index,m).points,0);
});
test('multiple distinct corroborations increase confidence, duplicates do not',()=>{
 const single={id:a,weight:80,agreement:'specific'},other={id:b,weight:60,agreement:'family'};
 assert.equal(corroboratedNeighborScore([single,single]).value,44);
 assert.ok(corroboratedNeighborScore([single,other]).value>44);
 assert.ok(corroboratedNeighborScore([{...single,weight:100},{...other,weight:100}]).value<=65);
});
test('public neighbor genres fetched by MBID and reused without new requests',async()=>{
 const urls=[],cache=new Map(),diag={};
 const fetcher=async url=>{
  urls.push(url);
  if(url.includes('/artist/?'))return {ok:true,json:async()=>({count:1,artists:[{id:a,name:'Example A',score:100,tags:[{name:'dream pop',count:3}]}]})};
  if(url.includes('listenbrainz'))return {ok:true,json:async()=>({[b]:[{similar_artist_mbid:b,similar_artist_name:'Example B'}]})};
  return {ok:true,json:async()=>({id:b,genres:[{name:'indie pop',count:2}]})};
 };
 const options={cache,fetcher,styleLimit:2,pause:async()=>{},diagnostics:diag};
 const first=await enrichPublicArtists(['Example A'],options);
 assert.deepEqual(first.get('example a').neighbors[0].tags,['indie pop']);
 assert.equal(diag.styledEdges,1);
 assert.equal(urls.length,3);
 const second=await enrichPublicArtists(['Example A'],{...options,limit:0,styleLimit:0});
 assert.deepEqual(second.get('example a').neighbors[0].tags,['indie pop']);
 assert.equal(urls.length,3);
});
