import assert from 'node:assert/strict';
import {test} from 'node:test';
import {privateCycle} from '../scripts/private-cycle.mjs';
import {rollCandidates} from '../scripts/automation-policy.mjs';
import {bandcampAlbum,bandcampLinks} from '../scripts/bandcamp-albums.mjs';
import {observationReport} from '../scripts/observation-report.mjs';
import {emptyTasteProfile} from '../editorial/taste-profile.mjs';
import {primaryReleaseDate} from '../scripts/release-metadata.mjs';
import {verifyAlbums} from '../scripts/weekly-evidence.mjs';
import {listeningResolver} from '../scripts/album-links.mjs';
const now=new Date('2026-11-19T12:00:00Z');
const album={artist:'Artist',current:{title:'Album',about:''},album_release_date:'13 Nov 2026 00:00:00 GMT'};
const structured={'@type':'MusicAlbum','@id':'https://label.bandcamp.com/album/album',name:'Album',byArtist:{name:'Artist'},datePublished:'13 Nov 2026 00:00:00 GMT',albumReleaseType:'AlbumRelease',numTracks:8};
const page=(tralbum=album,json=structured)=>'<div data-tralbum="'+JSON.stringify(tralbum).replaceAll('"','&quot;')+'" >x</div><script type="application/ld+json">'+JSON.stringify(json)+'</script>';

test('Bandcamp original album date requires matching independent identity, date and release type fields',()=>{
 const html=page();const record=bandcampAlbum(html,structured['@id'],'Label');
 assert.equal(record.releaseDate,'2026-11-13');assert.equal(primaryReleaseDate(html,record),'2026-11-13');
 for(const json of [{...structured,numTracks:2},{...structured,albumReleaseType:'SingleRelease'},{...structured,datePublished:'14 Nov 2026 00:00:00 GMT'},{...structured,byArtist:{name:'Other'}},{...structured,'@id':'https://other.test/album'}]) assert.equal(bandcampAlbum(page(album,json),structured['@id'],'Label'),undefined);
 assert.equal(bandcampAlbum(page({...album,current:{title:'Album',about:'Originally released in 1990'}}),structured['@id'],'Label'),undefined);
 assert.equal(primaryReleaseDate(page(),{...record,creator:'Wrong artist'}),undefined);
 assert.deepEqual(bandcampLinks('<a href="/album/a?label=123">a</a><a href="https://artist.bandcamp.com/album/b">b</a><a href="https://evil.test/album/c">c</a>', 'https://label.bandcamp.com/music'),['https://label.bandcamp.com/album/a','https://artist.bandcamp.com/album/b']);
});
test('rolling candidates keep their original first-seen timestamp through multiple refreshes',()=>{
 const first={id:'x',url:'https://radio.test/replay',sourceUrl:'https://radio.test/feed',format:'Radio show',collectedAt:'2026-11-17T00:00:00Z',firstSeenAt:'2026-11-10T00:00:00Z'};
 const once=rollCandidates([first],[{...first,collectedAt:now.toISOString(),firstSeenAt:undefined}],now);
 const twice=rollCandidates(once,[{...first,collectedAt:now.toISOString(),firstSeenAt:undefined}],now);
 assert.equal(twice[0].firstSeenAt,'2026-11-10T00:00:00Z');
});
test('daily cycles use the remotely synchronized profile, preserve candidates and confirm persistence across two runs',async()=>{
 const stored={profile:{...emptyTasteProfile(),favoriteArtists:['Khruangbin']},revision:7,profileUpdatedAt:now.toISOString(),state:{version:1,candidates:[{id:'prior',format:'Radio show',title:'Prior',url:'https://radio.test/prior',sourceUrl:'https://radio.test/feed',collectedAt:'2026-11-18T00:00:00Z',firstSeenAt:'2026-11-15T00:00:00Z'}],history:[],dryRuns:[]}};
 let followed=false,writes=0;
 const fetcher=async(url,options)=>{
   if(url.endsWith('/bo_runner_read'))return Response.json(stored);
   if(url.endsWith('/bo_runner_state_save')){writes++;stored.state=JSON.parse(options.body).document;return new Response('');}
   if(url.includes('UCZGBua-dvwfSdcF9AskDIgw'))followed=true;
   return new Response('',{status:404});
 };
 const env={SUPABASE_URL:'https://example.supabase.co',SUPABASE_PUBLISHABLE_KEY:'public',BONNES_ONDES_RUNNER_TOKEN:'test-runner',AUTO_PUBLISH_ENABLED:'false'};
 for(let i=0;i<2;i++) {
   const result=await privateCycle({mode:'collect',env,now:new Date(+now+i*1000),fetcher});
   assert.equal(result.profileRevision,7);assert.equal(result.incremental.retained,1);assert.equal(result.incremental.new,0);
 }
 assert.equal(followed,true);assert.equal(writes,2);assert.equal(stored.state.collections.length,2);
 assert.equal(stored.state.candidates[0].firstSeenAt,'2026-11-15T00:00:00Z');
 assert.equal(JSON.stringify(stored.state).includes('Khruangbin'),false);
});
test('revoked or missing synchronized profiles fail closed before contacting discovery providers',async()=>{
 let calls=0;
 await assert.rejects(privateCycle({env:{SUPABASE_URL:'https://example.supabase.co',SUPABASE_PUBLISHABLE_KEY:'public',BONNES_ONDES_RUNNER_TOKEN:'test'},fetcher:async()=>{calls++;return Response.json({profile:null});}}),/absent/);
 assert.equal(calls,1);
});
test('public observation export omits raw profile, private followed playlists, reactions and affinity reasons',()=>{
 const report={generatedAt:now.toISOString(),draft:{startsOn:'2026-11-23'},complete:false,personalized:true,gaps:{albums:3},errors:[],selected:{playlists:[{item:{id:'public',title:'Public',url:'https://public.test/playlist',sourceUrl:'https://public.test/source'},signals:['Private Artist'],score:12,reason:'secret preference',publicReason:'Verified public playlist.'}]}};
 const output=observationReport(report,{profileRevision:7,profileSignalCounts:{favoriteArtists:1},incremental:{before:1,after:2},albumEvidence:[],catalogues:[],sources:[{sourceId:'spotify-follow-1',feed:'https://private.test/secret'}],liveStatus:'ok',profile:{favoriteArtists:['Private Artist']}});
 assert.equal(output.sourceCoverage.length,0);
 assert.equal(JSON.stringify(output).includes('Private Artist'),false);assert.equal(JSON.stringify(output).includes('private.test'),false);
});
test('Spotify resolver follows only explicit smart links and canonicalizes international album URLs',async()=>{
 let called=false;
 const resolve=listeningResolver(async url=>{called=true;assert.equal(url,'https://label.lnk.to/record');return new Response('<a href="https://open.spotify.com/intl-fr/album/1234567890123456789012">Spotify</a>');},async()=>{});
 const result=await resolve({title:'Record',creator:'Artist',sourceUrl:'https://label.test/record',evidenceHtml:'<a href="https://label.lnk.to/record">Listen</a>'});
 assert.equal(called,true);assert.equal(result.url,'https://open.spotify.com/album/1234567890123456789012');
});

test('two-track Bandcamp singles never enter album verification even when the link resolves',async()=>{
 const html=page(album,{...structured,numTracks:2});
 const result=await verifyAlbums([{title:'Album',creator:'Artist',label:'Label',method:'bandcamp-album',sourceUrl:structured['@id'],releaseDate:'2026-11-13',evidenceHtml:html,url:'https://open.spotify.com/album/1234567890123456789012'}],()=>assert.fail('No Spotify call may validate a single as an album'));
 assert.equal(result[0].candidate,undefined);
});
