import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import { exactCatalogueArtwork, findNovaCatalogueArtwork, normalizeRecording } from '../app/nova-catalogue-artwork.mjs';

const row=(artistName,trackName,other={})=>({
  artistName,trackName,kind:'song',
  artworkUrl100:'https://is1-ssl.mzstatic.com/image/thumb/exact/100x100bb.jpg',
  trackViewUrl:'https://music.apple.com/fr/song/exact-song/12345',
  ...other
});

test('catalogue fallback accepts only the exact artist and title, never remixes, covers or lookalikes',()=>{
 const rows=[
  row('Air','Sexy Boy (Vegyn Version)'),
  row('Not Air','Sexy Boy'),
  row('Air','Sexy Boy')
 ];
 assert.deepEqual(exactCatalogueArtwork(rows,'AIR','sexy boy'),{
  artwork:'https://is1-ssl.mzstatic.com/image/thumb/exact/100x100bb.jpg',
  storeUrl:'https://music.apple.com/fr/song/exact-song/12345',
 });
 assert.equal(exactCatalogueArtwork(rows.slice(0,2),'Air','Sexy Boy'),null);
 assert.equal(exactCatalogueArtwork([row('OutKast','Jazzy Belle')],'OUTKAST','JAZZY BELLE')?.artwork,
  'https://is1-ssl.mzstatic.com/image/thumb/exact/100x100bb.jpg');
 assert.equal(exactCatalogueArtwork([row('Air','Sexy Boy',{artworkUrl100:'javascript:alert(1)'})],'Air','Sexy Boy'),null);
 assert.equal(exactCatalogueArtwork([row('Air','Sexy Boy',{trackViewUrl:'http://example.com'})],'Air','Sexy Boy'),null);
});

test('normalization tolerates capitalization, accents and typographic punctuation',()=>{
 assert.equal(normalizeRecording('SÉXY—BOY!'), 'sexy boy');
 assert.equal(normalizeRecording('OutKast'), 'outkast');
 assert.equal(normalizeRecording('I\u2019m Here'), 'im here');
});

test('public catalogue lookup is cached, searches FR first, then US for an exact match',async()=>{
 const calls=[];
 const fakeFetch=async url=>{
  const parsed=new URL(url);
  calls.push(parsed);
  const country=parsed.searchParams.get('country');
  return {ok:true,json:async()=>({results:country==='US'?[row('Example Artist','Deep Song')]:[]})};
 };
 const expected=await findNovaCatalogueArtwork('Example Artist','Deep Song',fakeFetch);
 assert.equal(expected?.artwork,'https://is1-ssl.mzstatic.com/image/thumb/exact/100x100bb.jpg');
 assert.deepEqual(calls.map(x=>x.searchParams.get('country')),['FR','US']);
 assert.ok(calls.every(x=>x.origin==='https://itunes.apple.com'));
 await findNovaCatalogueArtwork('Example Artist','Deep Song',fakeFetch);
 assert.equal(calls.length,2,'cached track must not trigger another request on each 30s refresh');
});

test('unknown recordings never receive guessed covers and errors fail closed',async()=>{
 const found=await findNovaCatalogueArtwork('Unindexed performer 9412','NotYetReleased 1833',
  async()=>({ok:true,json:async()=>({results:[row('Different performer','NotYetReleased 1833')]})}));
 assert.equal(found,null);
 const error=await findNovaCatalogueArtwork('Unreachable performer 14882','New Single 2017',
  async()=>{throw Error('Network error')});
 assert.equal(error,null);
});

test('radio cards attempt the exact cover lookup on failure or missing artwork and save the resolved image',()=>{
 const ui=readFileSync(new URL('../app/radio-track.tsx',import.meta.url),'utf8');
 assert.match(ui,/findNovaCatalogueArtwork\(track.artist, track.title\)/);
 assert.match(ui,/isNova \&\& !directArtwork \&\& !!matchedArtwork/);
 assert.match(ui,/onFailure=\{markArtworkFailed\}/);
 assert.match(ui,/artwork: displayedArtwork/);
 assert.match(ui,/saveTrack\(trackForSave\)/);
 assert.match(ui,/href=\{found.storeUrl\}/);
 assert.match(ui,/className="station-cover-store"/);
});
