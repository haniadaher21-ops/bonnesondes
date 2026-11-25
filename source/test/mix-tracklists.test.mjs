import assert from 'node:assert/strict';
import {test} from 'node:test';
import {normalizeTracks,ntsTracks,descriptionTracks,fipTracks,enrichRadioTracklists} from '../scripts/mix-tracklists.mjs';
import {rollCandidates} from '../scripts/automation-policy.mjs';
const now=new Date('2026-11-25T09:00:00Z');
const tracks=[{artist:'Cleo Sol',title:'Why Don’t You'},{artist:'SAULT',title:'Free'}];
const item={id:'nts-example',format:'Radio show',sourceId:'nts-example',sourceUrl:'https://www.nts.live/shows/example',url:'https://www.nts.live/shows/example/episodes/example-25th-november-2026',collectedAt:now.toISOString()};
test('NTS public structured tracks preserve order and exclude unknowns and duplicates',()=>{
 assert.deepEqual(ntsTracks({results:[...tracks,tracks[0],{artist:'Unknown Artist',title:'ID'},null]}),tracks);
 assert.deepEqual(ntsTracks({embeds:{tracklist:{results:tracks}}}),tracks);
 assert.deepEqual(ntsTracks({embeds:{tracklist:[]}}),[]);
});
test('YouTube explicit tracklist and timestamps do not include promotional text',()=>{
 assert.deepEqual(descriptionTracks('A soulful selection\n\nTracklist:\n00:00 Cleo Sol - Why Don’t You\n04:05 SAULT – Free\n\nFollow us - Instagram'),tracks);
 assert.deepEqual(descriptionTracks('00:00 intro\n01:00 Music - maybe\n02:00 talking'),[]);
 assert.deepEqual(descriptionTracks('A show - featuring great music\nSubscribe - today'),[]);
});
test('FIP recognizes explicitly structured playlist, not unrelated recordings',()=>{
 const html='<script type="application/ld+json">'+JSON.stringify({'@type':'MusicPlaylist',track:tracks.map(x=>({name:x.title,byArtist:{name:x.artist}}))})+'</script>';
 assert.deepEqual(fipTracks(html),tracks);
 assert.deepEqual(fipTracks('<h2>Programmation musicale</h2><ul><li>Cleo Sol – Why Don’t You</li><li>SAULT - Free</li></ul>'),tracks);
 assert.deepEqual(fipTracks('<p>About - this programme</p>'),[]);
});
test('radio enrichment verifies same episode, caches and preserves evidence in rolled candidates',async()=>{
 let requests=0;
 const fetcher=async url=>{requests++;assert.equal(url,'https://www.nts.live/api/v2/shows/example/episodes/example-25th-november-2026/tracklist');return Response.json({results:tracks});};
 const result=await enrichRadioTracklists([item],{now,fetcher});
 assert.deepEqual(result.items[0].tracklist.tracks,tracks);
 assert.equal(result.diagnostics.available,1);
 assert.equal(requests,1);
 const again=await enrichRadioTracklists(rollCandidates(result.items,[item],now),{now,fetcher});
 assert.equal(again.diagnostics.cached,1);
 assert.equal(requests,1);
});
test('missing tracklist is non-blocking and a rate limit suspends the provider',async()=>{
 const next={...item,id:'other',url:item.url.replace('example-25th','other-25th')};
 let requests=0;
 const result=await enrichRadioTracklists([item,next],{now,fetcher:async()=>{requests++;return new Response('',{status:429});}});
 assert.equal(requests,1);assert.equal(result.items.length,2);
 assert.equal(result.items[0].tracklist.status,'unavailable');
 assert.equal(result.diagnostics.errors,2);
});
