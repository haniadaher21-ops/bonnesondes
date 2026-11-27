import {test} from 'node:test';
import assert from 'node:assert/strict';
import {collectRecentLives,archivedLiveCandidate} from '../scripts/recent-lives.mjs';
import {documentedMixStyles} from '../scripts/mix-style-evidence.mjs';
import {editorialFeed} from '../scripts/discovery-feeds.mjs';
import {verifiedTracklistArtists} from '../scripts/tracklist-affinity.mjs';
import {weeklyShortlist} from '../scripts/weekly-ranking.mjs';
import {emptyTasteProfile} from '../editorial/taste-profile.mjs';
const now=new Date('2026-11-27T12:00:00Z');
const channelId='UC'+'a'.repeat(22),playlist='UU'+'a'.repeat(22);
const source={id:'kexp-fixture',name:'KEXP',method:'youtube-atom',mode:'automatic',channelId,url:'https://www.youtube.com/channel/'+channelId,titleContains:'live on kexp'};
const row=(id,date,channel=channelId,title='Example Artist - Full Performance (Live on KEXP)')=>({snippet:{title,videoOwnerChannelId:channel,resourceId:{videoId:id}},contentDetails:{videoId:id,videoPublishedAt:date+'T12:00:00Z'}});
test('recent archive collects beyond first page and ignores old and wrong-channel videos',async()=>{
 const calls=[];
 const fetcher=async url=>{
   const u=new URL(url);calls.push(u);
   if(u.pathname.endsWith('/channels'))return Response.json({items:[{id:channelId,contentDetails:{relatedPlaylists:{uploads:playlist}}}]});
   if(!u.searchParams.get('pageToken'))return Response.json({items:[row('aaaaaaaaaaa','2026-11-20'),row('bbbbbbbbbbb','2026-11-20','UC'+'b'.repeat(22))],nextPageToken:'next'});
   return Response.json({items:[row('ccccccccccc','2026-10-30'),row('ddddddddddd','2025-11-25')]});
 };
 const r=await collectRecentLives({sources:[source],key:'fixture',now,fetcher});
 assert.deepEqual(r.items.map(x=>x.id),['youtube-aaaaaaaaaaa','youtube-ccccccccccc']);
 assert.equal(r.items[1].creator,'Example Artist');
 assert.equal(r.items[1].verificationStatus,'source-verified');
 assert.equal(calls.length,3);assert.equal(r.sources[0].pages,2);
 assert.equal(archivedLiveCandidate(row('eeeeeeeeeee','2026-11-28'),source,now),undefined);
});
test('specific mix genres survive missing uploader tags, comparisons do not supply evidence',()=>{
 assert.deepEqual(documentedMixStyles({title:'NeoSoul / R&B DJ set | Funk'}),['neo soul','rnb','funk']);
 assert.deepEqual(documentedMixStyles({title:'Live DJ set',description:'For fans of dream pop. Subscribe for more soul.'}),[]);
});
test('only explicit Nova tracklists with matching RSS origin contribute artist credits',()=>{
 const url='https://podcasts.nova.fr/teuf-dappart/episode-123';
 const feed='https://podcasts.nova.fr/teuf-dappart/feed/rss/website.xml';
 const source={id:'nova-fixture',provider:'Radio Nova',mixKind:'dj-set',method:'podcast-rss',url:'https://podcasts.nova.fr/teuf-dappart',itemPrefix:'/teuf-dappart/',feed};
 const xml='<rss><channel><item><title>DJ set soul</title><link>'+url+'</link><pubDate>Fri, 27 Nov 2026 10:00:00 GMT</pubDate><description><![CDATA[Artist - Title\nOne - Track A\nTwo - Track B]]></description></item></channel></rss>';
 const [item]=editorialFeed(xml,source).candidates;
 assert.deepEqual(item.tags,['soul']);assert.equal(item.novaRssTracks.length,2);
 const mix={...item,provider:'Radio Nova',mixKind:'dj-set',tracklist:{status:'available',checkedAt:now.toISOString(),method:'nova-rss',sourceUrl:feed,tracks:item.novaRssTracks}};
 assert.deepEqual(verifiedTracklistArtists(mix,now),['One','Two']);
 assert.deepEqual(verifiedTracklistArtists({...mix,tracklist:{...mix.tracklist,sourceUrl:'https://podcasts.nova.fr/other/feed/rss/website.xml'}},now),[]);
});
test('weighted weekly live ranking excludes archival sessions without changing baseline mode',()=>{
 const old={...archivedLiveCandidate(row('aaaaaaaaaaa','2026-11-20'),source,now),date:'2018-06-27',minutes:20,verificationStatus:'performance-verified',tags:['neo soul']};
 const current={...old,id:'youtube-ccccccccccc',url:'https://www.youtube.com/watch?v=ccccccccccc',creator:'Other Artist',date:'2026-11-20'};
 const args={candidates:[old,current],profile:emptyTasteProfile(),earlier:[],catalog:[],startsOn:'2026-11-30',now};
 const profile={artists:[{artist:'Example Artist',score:95}],known_artist_names:['Example Artist'],excluded_artists:[],style_preferences:[{tag:'neo soul',score:85}]};
 assert.ok(weeklyShortlist(args).rankings.some(x=>x.item.id===old.id));
 const r=weeklyShortlist({...args,weightedProfile:profile,weightedWeight:1});
 assert.ok(!r.rankings.some(x=>x.item.id===old.id));
 assert.ok(r.selected.live.some(x=>x.item.id===current.id));
});