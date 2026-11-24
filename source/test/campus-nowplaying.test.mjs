import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseSpinitronReader, parseCampusParisReader, parseRadioCultLive } from '../app/campus-nowplaying.mjs';

const now=new Date('2026-11-24T08:56:00Z');
test('KALX public playlist identifies the last song and its actual album image', () => {
  const input='Title: KALX URL Source: https://programming.kalx.berkeley.edu/KALX/ Markdown Content: '+
    '[12:45 AM](https://programming.kalx.berkeley.edu/KALX/pl/23392130/Information-Overload?sp=466854921)'+
    '![Image 1: Eyvind Kang - Riparian B](https://is1-ssl.mzstatic.com/image/thumb/Music221/v4/a4/90/57571.jpg/225x225bb.jpg)';
  assert.deepEqual(parseSpinitronReader(input,'America/Los_Angeles',now),{
    title:'Riparian B',artist:'Eyvind Kang',kind:'last-confirmed',playedAt:'12:45 AM',
    artwork:'https://is1-ssl.mzstatic.com/image/thumb/Music221/v4/a4/90/57571.jpg/225x225bb.jpg',
  });
});
test('WRBB and KZSC metadata remains tied to each broadcaster', () => {
  const input='Markdown Content: [3:55 AM](https://spinitron.com/WRBB/pl/23392176/test?sp=466855561)'+
  '![Image 1: Everyone Asked About You - Sometimes Memory Fails Me Sometimes](https://is1-ssl.mzstatic.com/a.jpg)';
  assert.equal(parseSpinitronReader(input,'America/New_York',now)?.artist,'Everyone Asked About You');
  assert.equal(parseSpinitronReader(input,'America/Los_Angeles',now),null);
});
test('stale Spinitron entries and placeholder artwork are never presented as album art', () => {
  const stale='Markdown Content: [9:15 PM](https://spinitron.com/KZSC/pl/1/test?sp=3)'+
    '![Image 1: Artist - Old Song](https://is1-ssl.mzstatic.com/a.jpg)';
  assert.equal(parseSpinitronReader(stale,'America/Los_Angeles',now),null);
  const noCover='Markdown Content: [12:53 AM](https://spinitron.com/KZSC/pl/1/test?sp=3)'+
    '![Image 1: Artist - New Song](https://spinitron.com/static/pictures/placeholders/loudspeaker.png)';
  assert.equal(parseSpinitronReader(noCover,'America/Los_Angeles',now)?.artwork,undefined);
});
test('Radio Campus Paris title and photo are paired to the first recent broadcast', () => {
  const input='Title: C’était quoi ce morceau ? Markdown Content: C’était quoi ce morceau ? Date Heure '+
    '![Image 2: Asinine - Anchorage](https://img.alticdn.com/a.jpg) Anchorage Asinine 09:49 '+
    '![Image 3: Older - Song](https://img.alticdn.com/b.jpg) Song Older 09:38';
  assert.deepEqual(parseCampusParisReader(input,now),{
    title:'Anchorage',artist:'Asinine',artwork:'https://img.alticdn.com/a.jpg',
    playedAt:'09:49',kind:'last-confirmed',
  });
  assert.equal(parseCampusParisReader(input,new Date('2026-11-24T11:00:00Z')),null);
});
test('RadioCult requires actual artist and track, not only the name of a live show', () => {
  assert.deepEqual(parseRadioCultLive({success:true,result:{status:'schedule',metadata:{
    title:'Groove Song',artist:'Artist',artwork:{'256x256':'https://example.com/cover.png'}
  }}}),{title:'Groove Song',artist:'Artist',artwork:'https://example.com/cover.png',kind:'live'});
  assert.equal(parseRadioCultLive({success:true,result:{status:'schedule',content:{title:'Breakfast Club'}}}),null);
  assert.equal(parseRadioCultLive({success:true,result:{status:'offAir',metadata:{title:'Track',artist:'X'}}}),null);
});
test('Campus radios only live in the second tab; no generic covers are fabricated',()=>{
  const page=readFileSync(new URL('../app/journal.tsx',import.meta.url),'utf8');
  const stations=readFileSync(new URL('../app/content.ts',import.meta.url),'utf8');
  const track=readFileSync(new URL('../app/radio-track.tsx',import.meta.url),'utf8');
  assert.match(page,/\['campus', 'Radios Campus'\]/);
  assert.match(page,/page === 'campus'\s*\? item\.category === 'campus'/);
  assert.equal((stations.match(/category: 'campus'/g)??[]).length,7);
  assert.match(track,/station-cover-placeholder/);
  assert.match(track,/Titre non confirmé par la station/);
});
