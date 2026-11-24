import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseSpinitronReader, parseCampusParisReader, parseRadioCultLive, parseKcrwNowPlaying, parseWxycReader } from '../app/campus-nowplaying.mjs';

const now=new Date('2026-11-24T08:56:00Z');
test('KALX public playlist identifies the last song and its actual album image', () => {
  const input='Title: KALX URL Source: https://programming.kalx.berkeley.edu/KALX/ Markdown Content: #### On air ### Test Nov 24, 2026 12:00 AM–7:00 AM '+
    '[12:45 AM](https://programming.kalx.berkeley.edu/KALX/pl/23392130/Information-Overload?sp=466854921)'+
    '![Image 1: Eyvind Kang - Riparian B](https://is1-ssl.mzstatic.com/image/thumb/Music221/v4/a4/90/57571.jpg/225x225bb.jpg)';
  assert.deepEqual(parseSpinitronReader(input,'America/Los_Angeles',now),{
    title:'Riparian B',artist:'Eyvind Kang',kind:'last-confirmed',playedAt:'12:45 AM',
    artwork:'https://is1-ssl.mzstatic.com/image/thumb/Music221/v4/a4/90/57571.jpg/225x225bb.jpg',
  });
});
test('WRBB and KZSC metadata remains tied to each broadcaster', () => {
  const input='Markdown Content: #### On air ### Test Nov 24, 2026 1:00 AM–7:00 AM [3:55 AM](https://spinitron.com/WRBB/pl/23392176/test?sp=466855561)'+
  '![Image 1: Everyone Asked About You - Sometimes Memory Fails Me Sometimes](https://is1-ssl.mzstatic.com/a.jpg)';
  assert.equal(parseSpinitronReader(input,'America/New_York',now)?.artist,'Everyone Asked About You');
  assert.equal(parseSpinitronReader(input,'America/Los_Angeles',now),null);
});
test('stale Spinitron entries and placeholder artwork are never presented as album art', () => {
  const stale='Markdown Content: #### On air ### Test Nov 24, 2026 5:00 PM–11:00 PM [9:15 PM](https://spinitron.com/KZSC/pl/1/test?sp=3)'+
    '![Image 1: Artist - Old Song](https://is1-ssl.mzstatic.com/a.jpg)';
  assert.equal(parseSpinitronReader(stale,'America/Los_Angeles',now),null);
  const noCover='Markdown Content: #### On air ### Test Nov 24, 2026 12:00 AM–6:00 AM [12:53 AM](https://spinitron.com/KZSC/pl/1/test?sp=3)'+
    '![Image 1: Artist - New Song](https://spinitron.com/static/pictures/placeholders/loudspeaker.png)';
  assert.equal(parseSpinitronReader(noCover,'America/Los_Angeles',now)?.artwork,undefined);
});
test('Spinitron rejects yesterday’s page even when the clock time looks recent', () => {
  const cached='Markdown Content: #### On air ### Old Show Nov 23, 2026 1:00 AM–7:00 AM '+
    '[12:53 AM](https://spinitron.com/KZSC/pl/1/test?sp=3)'+
    '![Image 1: Artist - Old Song](https://is1-ssl.mzstatic.com/a.jpg)';
  assert.equal(parseSpinitronReader(cached,'America/Los_Angeles',now),null);
});

test('KCRW Eclectic24 exposes verified album art, artist and actual broadcaster time',()=>{
  const live={program_id:'e24',title:'Too Sweet',artist:'Hozier',
    datetime:'2026-11-24T05:35:59-08:00',time:'05:35 AM',
    albumImage:'https://i.scdn.co/image/example.jpg'};
  const unrelated={...live,program_id:'fm',title:'Other song'};
  assert.deepEqual(parseKcrwNowPlaying([unrelated,live],new Date('2026-11-24T13:40:00Z')),{
    title:'Too Sweet',artist:'Hozier',kind:'last-confirmed',playedAt:'05:35 AM',
    artwork:'https://i.scdn.co/image/example.jpg',
  });
  assert.equal(parseKcrwNowPlaying([live],new Date('2026-11-24T16:40:00Z')),null);
  assert.equal(parseKcrwNowPlaying([{...live,artist:''}]),null);
});

test('WXYC official flowsheet reveals songs but never treats a finished DJ set as live',()=>{
  const row={entry_type:'track',show_id:5,artist_name:'Nina Simone',track_title:'Stars',
    add_time:'2026-11-24T13:30:00Z',artwork_url:'https://example.org/album.png'};
  const response=entries=>'Title: WXYC URL Source: https://api.wxyc.org/flowsheet?limit=30 Markdown Content: '+
    JSON.stringify({entries});
  const date=new Date('2026-11-24T13:40:00Z');
  assert.deepEqual(parseWxycReader(response([row]),date),{
    title:'Stars',artist:'Nina Simone',artwork:'https://example.org/album.png',
    playedAt:'08:30',kind:'last-confirmed',
  });
  assert.equal(parseWxycReader(response([{entry_type:'show_end',show_id:5,add_time:'2026-11-24T13:32:00Z'},row]),date),null);
  assert.equal(parseWxycReader(response([row]),new Date('2026-11-24T16:00:00Z')),null);
  assert.equal(parseWxycReader('invalid'),null);
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
