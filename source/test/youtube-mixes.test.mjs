import assert from 'node:assert/strict';
import {test} from 'node:test';
import {collectYouTubeMixes,verifiedYouTubeMix,youtubeMixQueries} from '../scripts/youtube-mixes.mjs';
import {isFreshMusicMix} from '../scripts/recommendation-policy.mjs';

const channel='UC'+'A'.repeat(22);
const video=(id,title='I Love You | 60s - 70s Rhythm and Soul Playlist',date='2026-11-20',duration='PT1H10M')=>({
 id,snippet:{title,channelId:channel,channelTitle:'Soul Vinyl Curator',
   publishedAt:date+'T14:00:00Z',liveBroadcastContent:'none',
   thumbnails:{high:{url:'https://i.ytimg.com/vi/'+id+'/hqdefault.jpg'}},tags:['soul','funk']},
 status:{privacyStatus:'public',embeddable:true},contentDetails:{duration},
});

test('a long musical playlist on a YouTube channel is a valid weekly mix',()=>{
 const item=verifiedYouTubeMix(video('3C01eaL5_Xw'),'2026-11-23','2026-11-22');
 assert.equal(item.mixKind,'curated-mix');
 assert.equal(item.format,'Radio show');
 assert.equal(item.embed.provider,'youtube');
 assert.equal(item.url,'https://www.youtube.com/watch?v=3C01eaL5_Xw');
 assert.equal(item.artwork,'https://i.ytimg.com/vi/3C01eaL5_Xw/hqdefault.jpg');
 assert.equal(isFreshMusicMix(item,'2026-11-23','2026-11-22'),true);
});

test('reject old uploads, short tracks, jazz, interviews and unembeddable YouTube videos',()=>{
 assert.equal(verifiedYouTubeMix(video('3C01eaL5_Xw',undefined,'2025-11-20'),'2026-11-23','2026-11-22'),undefined);
 assert.equal(verifiedYouTubeMix(video('3C01eaL5_Xw',undefined,'2026-11-20','PT3M'),'2026-11-23','2026-11-22'),undefined);
 assert.equal(verifiedYouTubeMix(video('3C01eaL5_Xw','Jazz vinyl playlist'),'2026-11-23','2026-11-22'),undefined);
 assert.equal(verifiedYouTubeMix(video('3C01eaL5_Xw','DJ interview about playlist'),'2026-11-23','2026-11-22'),undefined);
 assert.equal(verifiedYouTubeMix({...video('3C01eaL5_Xw'),status:{privacyStatus:'public',embeddable:false}},'2026-11-23','2026-11-22'),undefined);
 assert.equal(verifiedYouTubeMix({...video('3C01eaL5_Xw'),snippet:{...video('3C01eaL5_Xw').snippet,tags:['jazz']}},'2026-11-23','2026-11-22'),undefined);
});

test('YouTube search verifies matching videos with its API and deduplicates overlapping searches',async()=>{
 const valid=video('3C01eaL5_Xw');
 let searches=0,verified=0;
 const fetcher=async url=>{
  const target=new URL(url);
  assert.equal(target.searchParams.get('publishedAfter'),'2026-11-16T00:00:00Z');
  if(target.pathname.endsWith('/search')){
   searches++;
   assert.equal(target.searchParams.get('type'),'video');
   assert.equal(target.searchParams.get('videoDuration'),'long');
   return Response.json({items:[{id:{videoId:valid.id}},{id:{videoId:valid.id}}]});
  }
  assert.ok(target.pathname.endsWith('/videos'));
  verified++;
  return Response.json({items:[valid]});
 };
 const result=await collectYouTubeMixes({startsOn:'2026-11-23',today:'2026-11-22',profile:{explore:['Soul']},key:'fixture-api-key',fetcher});
 assert.equal(searches,youtubeMixQueries.length+1);
 assert.equal(verified,1);
 assert.equal(result.items.length,1);
 assert.equal(result.items[0].title,valid.snippet.title);
 assert.equal(result.items[0].source,'YouTube · Soul Vinyl Curator');
 assert.equal(result.status,'ok');
});

test('YouTube verification fails closed if key is missing',async()=>{
 const result=await collectYouTubeMixes({startsOn:'2026-11-23',today:'2026-11-22',
  fetcher:()=>{throw new Error('no network expected');}});
 assert.deepEqual(result.items,[]);
 assert.equal(result.status,'not-configured');
});
