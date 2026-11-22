import assert from 'node:assert/strict';
import {test} from 'node:test';
import {collectYouTubeMixes,verifiedYouTubeMix,youtubeMixQueries} from '../scripts/youtube-mixes.mjs';
import {isFreshMusicMix} from '../scripts/recommendation-policy.mjs';
import {rollCandidates} from '../scripts/automation-policy.mjs';
import {observationReport} from '../scripts/observation-report.mjs';

const channelId='UC'+'A'.repeat(22);
const channel=(subs=56000)=>({id:channelId,statistics:{subscriberCount:String(subs)}});
const video=(id='3C01eaL5_Xw',title='All-vinyl 70s soul & funk DJ mix | DJ Sample',
 date='2026-11-20',duration='PT1H10M',views=150000)=>({
 id,snippet:{title,channelId,channelTitle:'DJ Sample Vinyl Club',
   publishedAt:date+'T14:00:00Z',liveBroadcastContent:'none',
   thumbnails:{high:{url:'https://i.ytimg.com/vi/'+id+'/hqdefault.jpg'}},tags:['soul','funk']},
 status:{privacyStatus:'public',embeddable:true},contentDetails:{duration},
 statistics:{viewCount:String(views),likeCount:'520'},
});
test('verified credible vinyl mix embeds inside Bonnes Ondes with YouTube player',()=>{
 const item=verifiedYouTubeMix(video(),'2026-11-23','2026-11-22',channel());
 assert.equal(item.mixKind,'curated-mix');
 assert.equal(item.audienceVerified,true);
 assert.equal(item.viewCount,150000);
 assert.equal(item.mixStyle,'soul');
 assert.equal(item.mixStyleVerified,true);
 assert.equal(item.subscriberCount,56000);
 assert.equal(item.embed.provider,'youtube');
 assert.equal(item.url,'https://www.youtube.com/watch?v=3C01eaL5_Xw');
 assert.equal(item.artwork,'https://i.ytimg.com/vi/3C01eaL5_Xw/hqdefault.jpg');
 assert.equal(isFreshMusicMix(item,'2026-11-23','2026-11-22'),true);
});
test('100,000 actual video views are mandatory, regardless of channel subscriber count',()=>{
 assert.equal(verifiedYouTubeMix(video('3C01eaL5_Xw',undefined,undefined,undefined,99999),
  '2026-11-23','2026-11-22',channel(250000)),undefined);
 assert.equal(verifiedYouTubeMix(video('3C01eaL5_Xw',undefined,undefined,undefined,100000),
  '2026-11-23','2026-11-22',channel(56000))?.viewCount,100000);
});
test('R&B, soul, blues, pop and mellow soulful house are preferred; techno and electro are forbidden',()=>{
 const names=[
  ['R&B soul DJ mix','rnb'],['Blues guitar vinyl DJ set','blues'],
  ['Indie pop DJ mix','pop'],['Soulful house mellow DJ set','soul'],
  ['Soft house and chill grooves DJ set','light-house'],
 ];
 for(const [title,expected] of names){
   const item=verifiedYouTubeMix(video('3C01eaL5_Xw',title),'2026-11-23','2026-11-22',channel());
   assert.equal(item?.mixStyle,expected,'Expected genre '+expected+' for '+title);
 }
 for(const title of ['Electro DJ mix soul','Techno vinyl R&B set','EDM soul playlist DJ mix',
   'Hard house DJ set R&B','Tech house DJ mix soulful']){
   assert.equal(verifiedYouTubeMix(video('3C01eaL5_Xw',title),
     '2026-11-23','2026-11-22',channel()),undefined,title);
 }
 assert.equal(verifiedYouTubeMix(video('3C01eaL5_Xw','DJ set without genre evidence'),
  '2026-11-23','2026-11-22',channel()),undefined);
});
test('reject fake audiences, tiny channels, nine views and unknown subscriber counts',()=>{
 assert.equal(verifiedYouTubeMix(video('3C01eaL5_Xw',undefined,undefined,undefined,9),'2026-11-23','2026-11-22',channel(2)),undefined);
 assert.equal(verifiedYouTubeMix(video(),'2026-11-23','2026-11-22'),undefined);
 assert.equal(verifiedYouTubeMix(video(),'2026-11-23','2026-11-22',channel(2)),undefined);
 assert.equal(verifiedYouTubeMix(video('3C01eaL5_Xw',undefined,undefined,undefined,9),'2026-11-23','2026-11-22',channel(56000)),undefined);
});
test('reject older uploads, short tracks, jazz, interviews and disabled embeds',()=>{
 assert.equal(verifiedYouTubeMix(video('3C01eaL5_Xw',undefined,'2025-11-20'),'2026-11-23','2026-11-22',channel()),undefined);
 assert.equal(verifiedYouTubeMix(video('3C01eaL5_Xw',undefined,'2026-11-20','PT3M'),'2026-11-23','2026-11-22',channel()),undefined);
 assert.equal(verifiedYouTubeMix(video('3C01eaL5_Xw','Jazz vinyl playlist'),'2026-11-23','2026-11-22',channel()),undefined);
 assert.equal(verifiedYouTubeMix(video('3C01eaL5_Xw','DJ interview about playlist'),'2026-11-23','2026-11-22',channel()),undefined);
 assert.equal(verifiedYouTubeMix(video('3C01eaL5_Xw','Best Vintage Funk Mix 2026'),'2026-11-23','2026-11-22',channel()),undefined);
 assert.equal(verifiedYouTubeMix({...video(),status:{privacyStatus:'public',embeddable:false}},'2026-11-23','2026-11-22',channel()),undefined);
 assert.equal(verifiedYouTubeMix({...video(),snippet:{...video().snippet,tags:['jazz']}},'2026-11-23','2026-11-22',channel()),undefined);
});
test('search verifies view counts and subscriber counts through two different official APIs',async()=>{
 let searches=0,videos=0,channels=0;const valid=video();
 const fetcher=async(url,args)=>{
  const target=new URL(url);
  assert.equal(args.headers['x-goog-api-key'],'fixture-api-key');
  assert.equal(target.searchParams.has('key'),false);
  if(target.pathname.endsWith('/search')){
    searches++;
    assert.equal(target.searchParams.get('publishedAfter'),'2025-11-23T00:00:00Z');
    assert.equal(target.searchParams.get('order'),'viewCount');
    return Response.json({items:[{id:{videoId:valid.id}},{id:{videoId:valid.id}}]});
  }
  if(target.pathname.endsWith('/videos')){
    videos++;
    assert.match(target.searchParams.get('part'),/statistics/);
    return Response.json({items:[valid]});
  }
  if(target.pathname.endsWith('/channels')){
    channels++;
    assert.equal(target.searchParams.get('id'),channelId);
    return Response.json({items:[channel()]});
  }
  throw new Error('Unexpected YouTube endpoint');
 };
 const r=await collectYouTubeMixes({startsOn:'2026-11-23',today:'2026-11-22',profile:{explore:['Soul']},key:'fixture-api-key',fetcher});
 assert.equal(searches,youtubeMixQueries.length+1);
 assert.equal(videos,1);assert.equal(channels,1);
 assert.equal(r.items.length,1);
 assert.equal(r.items[0].title,valid.snippet.title);
 assert.equal(r.status,'ok');
});
test('without YouTube API key no scraping or fabricated statistics is allowed',async()=>{
 const r=await collectYouTubeMixes({startsOn:'2026-11-23',today:'2026-11-22',
   fetcher:()=>{throw new Error('network access should not occur');}});
 assert.deepEqual(r.items,[]);
 assert.equal(r.status,'not-configured');
});
test('the real video must be timestamped before it enters the candidate rollup',()=>{
 const sample=verifiedYouTubeMix(video(),'2026-11-23','2026-11-22',channel());
 const now=new Date('2026-11-22T18:00:00Z');
 assert.equal(rollCandidates([],[sample],now).length,0);
 const saved=rollCandidates([],[{...sample,collectedAt:now.toISOString()}],now);
 assert.equal(saved.length,1);
 assert.equal(saved[0].audienceVerified,true);
 assert.equal(saved[0].mixStyle,'soul');
});

test('public preview preserves the verified YouTube audience evidence and embeddable player',()=>{
 const candidate=verifiedYouTubeMix(video(),'2026-11-23','2026-11-22',channel());
 const report=observationReport({
  generatedAt:'2026-11-22T19:00:00Z',draft:{startsOn:'2026-11-23'},complete:true,
  personalized:false,gaps:{},errors:[],selected:{youtube:[{
    item:candidate,score:100,signals:[],publicReason:'Vrai DJ set reconnu',
  }]},
 },{
  profileRevision:1,profileUpdatedAt:'2026-11-22T19:00:00Z',
  profileSignalCounts:{},comparison:{},incremental:{},albumEvidence:[],
  catalogues:[],sources:[],liveStatus:{},
 });
 assert.equal(report.selected.youtube[0].audienceVerified,true);
 assert.equal(report.selected.youtube[0].embed.provider,'youtube');
 assert.equal(report.selected.youtube[0].viewCount,150000);
 assert.equal(report.selected.youtube[0].subscriberCount,56000);
});
