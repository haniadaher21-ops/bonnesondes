import assert from 'node:assert/strict';
import {test} from 'node:test';
import {editorialWorkScore} from '../scripts/editorial-work-score.mjs';
import {weeklyShortlist} from '../scripts/weekly-ranking.mjs';
import {emptyTasteProfile,importWeightedTaste} from '../editorial/taste-profile.mjs';
import {stereogumPrimaryRecords} from '../scripts/music-press.mjs';
const date='2026-11-20',now=new Date('2026-11-27T12:00:00Z');
const album=(id,creator,tags)=>({id,title:'Record '+id,creator,format:'Album',source:'Example label',provider:'Example label',url:'https://open.spotify.com/album/'+id,sourceUrl:'https://example.test/album/'+id,releaseDate:date,date,verificationStatus:'primary-verified',editorialSource:'Stereogum',editorialKind:'curator-pick',editorialClaim:'Album of the Week',editorialUrl:'https://stereogum.com/123/album-of-the-week-example/reviews/album-of-the-week',editorialPublishedAt:'2026-11-24',tags});
const styles=[{tag:'dream pop',score:85}];
test('work-specific genre wins over mere artist familiarity; unknown tags are not proof',()=>{
 const fit=editorialWorkScore(album('a','New Artist',['dream pop']),{styles,known:false,now});
 const different=editorialWorkScore(album('b','Known Artist',['techno']),{styles,known:true,now,affinity:{points:25}});
 assert.ok(fit.points>different.points);
 assert.equal(fit.discovery,1);
 assert.equal(editorialWorkScore(album('c','New Artist',['France']),{styles,known:false,now}).discovery,0);
});
test('weekly ranking uses editorial style only in weighted mode',()=>{
 const args={candidates:[album('a','Known Artist',['techno']),album('b','New Artist',['dream pop'])],profile:emptyTasteProfile(),earlier:[],catalog:[],startsOn:'2026-11-30',now};
 const weightedProfile={artists:[{artist:'Known Artist',score:90}],known_artist_names:['Known Artist'],excluded_artists:[],style_preferences:styles};
 const plain=weeklyShortlist(args);
 assert.deepEqual(weeklyShortlist({...args,weightedProfile}),plain);
 const result=weeklyShortlist({...args,weightedProfile,weightedWeight:1});
 assert.equal(result.selected.albums[0].item.id,'b');
});
test('private style profile round trips and rejects invalid weights',()=>{
 const payload={type:'bonnes-ondes-weighted-profile',version:1,weightedProfile:{artists:[],known_artist_names:[],excluded_artists:[],style_preferences:styles}};
 assert.deepEqual(importWeightedTaste(emptyTasteProfile(),payload).weightedProfile.style_preferences,styles);
 assert.throws(()=>importWeightedTaste(emptyTasteProfile(),{...payload,weightedProfile:{...payload.weightedProfile,style_preferences:[{tag:'dream pop',score:101}]}}));
});
test('Stereogum primary lead requires exact identity, original date and independently verified release',async()=>{
 const review='https://stereogum.com/123/album-of-the-week-example/reviews/album-of-the-week',url='https://artist.bandcamp.com/album/album';
 const tralbum={artist:'Artist',current:{title:'Album',about:''},album_release_date:'20 Nov 2026 00:00:00 GMT'};
 const structured={'@type':'MusicAlbum','@id':url,name:'Album',byArtist:{name:'Artist'},datePublished:'20 Nov 2026 00:00:00 GMT',albumReleaseType:'AlbumRelease',numTracks:8};
 const html='<div data-tralbum="'+JSON.stringify(tralbum).replaceAll('"','&quot;')+'" ></div><script type="application/ld+json">'+JSON.stringify(structured)+'</script><a class="tag">dream pop</a>';
 const article='<a href="'+url+'">Listen</a>';
 const fetcher=async()=>new Response(html);
 const result=await stereogumPrimaryRecords(article,review,[{headline:'Artist Album',editorialSource:'Stereogum'}],fetcher);
 assert.equal(result.length,1);assert.deepEqual(result[0].tags,['dream pop']);
 assert.deepEqual(await stereogumPrimaryRecords(article,review,[{headline:'Other Album'}],fetcher),[]);
});

const live=(id,creator,tags)=>({id,title:creator+' - Song (Live on KEXP)',creator,format:'Live session',source:'KEXP',sourceId:'kexp-live',url:'https://www.youtube.com/watch?v='+id,sourceUrl:'https://www.youtube.com/watch?v='+id,date:'2026-11-24',minutes:5,officialVideo:true,verificationStatus:'performance-verified',tags});
const radio=(id,tags,artists)=>({id,title:id,creator:'DJ Example',format:'Radio show',source:'NTS Radio',provider:'NTS',sourceId:'nts-example',mixKind:'dj-set',date:'2026-11-25',verificationStatus:'source-verified',url:'https://www.nts.live/shows/example/episodes/'+id,sourceUrl:'https://www.nts.live/shows/example/episodes/'+id,tags,tracklist:{status:'available',method:'nts-api',checkedAt:now.toISOString(),sourceUrl:'https://www.nts.live/api/v2/shows/example/episodes/'+id+'/tracklist',tracks:artists.map(artist=>({artist,title:'Title'}))}});
test('live ranks work-specific styles ahead of familiar but unrelated artists',()=>{
 const args={candidates:[live('aaaaaaaaaaa','Known Artist',['techno']),live('bbbbbbbbbbb','New Artist',['dream pop'])],profile:emptyTasteProfile(),earlier:[],catalog:[],startsOn:'2026-11-30',now};
 const profile={artists:[{artist:'Known Artist',score:85}],excluded_artists:[],known_artist_names:['Known Artist'],style_preferences:styles};
 const report=weeklyShortlist({...args,weightedProfile:profile,weightedWeight:1});
 assert.equal(report.selected.live[0].item.creator,'New Artist');
 assert.deepEqual(weeklyShortlist({...args,weightedProfile:profile}),weeklyShortlist(args));
});
test('mix style and verified programming outrank familiar DJ and unrelated genre',()=>{
 const items=[radio('a',['techno'],['Known Artist','Other']),radio('b',['dream pop'],['New Artist','Other'])];
 const args={candidates:items,profile:emptyTasteProfile(),earlier:[],catalog:[],startsOn:'2026-11-30',now};
 const profile={artists:[{artist:'Known Artist',score:85},{artist:'DJ Example',score:100}],excluded_artists:[],known_artist_names:['Known Artist','DJ Example'],style_preferences:styles};
 const report=weeklyShortlist({...args,weightedProfile:profile,weightedWeight:1});
 assert.equal(report.selected.nts[0].item.id,'b');
 assert.equal(report.selected.nts[0].weightedAffinity.points,0);
 assert.equal(report.selected.nts[0].editorialWork.discovery,1);
});
test('missing tracklists and undocumented genres do not fabricate discovery',()=>{
 const item=radio('a',[],['New Artist','Other']);
 const result=editorialWorkScore(item,{styles,now,credits:['New Artist','Other'],tracklistVerified:false,knownArtists:new Set()});
 assert.equal(result.styleMatch,0);assert.equal(result.discovery,0);
 assert.equal(result.quality,.75);
});
test('one tagged artist cannot define an entire long mix',()=>{
 const names=['New Artist',...Array.from({length:19},(_,i)=>'Other '+i)];
 const result=editorialWorkScore(radio('a',[],names),{styles,now,credits:names,tracklistVerified:true,metadata:new Map([['new artist',{status:'verified',tags:['dream pop']}]]),knownArtists:new Set()});
 assert.ok(result.styleMatch<.05);
 assert.equal(result.documentedCredits,1);
});

test('NTS page genre extraction is scoped to the matching episode header',async()=>{
 const {ntsEpisodePageGenres}=await import('../scripts/discovery.mjs');
 const page='<h1>Example &amp; Friend</h1><h2>With Example</h2><a href="/explore/genre/soulrhythm-soul">Soul</a><a href="/explore/genre/rock-folk">Folk</a><h3>Description</h3><h4>You Might Also Like</h4><a href="/explore/genre/housetechno-techno">Techno</a>';
 assert.deepEqual(ntsEpisodePageGenres(page,'Example & Friend'),['Soul','Folk']);
 assert.deepEqual(ntsEpisodePageGenres(page,'Other'),[]);
});

test('generic rock and a press award cannot substitute for musical fit',()=>{
 const taste=[{tag:'neo soul',score:85},{tag:'alternative r&b',score:75},{tag:'indie rock',score:55}];
 const unrelated=editorialWorkScore(album('a','Unknown',['rock','krautrock']),{styles:taste,now,known:false});
 const match=editorialWorkScore(album('b','New Artist',['neo soul','funk']),{styles:taste,now,known:false});
 assert.equal(unrelated.tasteSupported,false);assert.equal(unrelated.discovery,0);
 assert.ok(match.tasteSupported);assert.ok(match.points>unrelated.points);
 const args={candidates:[album('a','Unknown',['rock','krautrock']),album('b','New Artist',['neo soul','funk'])],profile:emptyTasteProfile(),earlier:[],catalog:[],startsOn:'2026-11-30',now};
 const result=weeklyShortlist({...args,weightedProfile:{artists:[],known_artist_names:[],excluded_artists:[],style_preferences:taste},weightedWeight:1});
 assert.deepEqual(result.selected.albums.map(x=>x.item.id),['b']);assert.equal(result.gaps.albums,2);
});
test('a known artist with meaningful affinity can qualify without documented album tags',()=>{
 const result=editorialWorkScore(album('a','Known',[]),{styles,now,known:true,affinity:{points:12}});
 assert.equal(result.tasteSupported,true);assert.equal(result.discovery,0);
});
