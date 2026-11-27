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
