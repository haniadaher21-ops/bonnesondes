import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const journal = readFileSync(new URL('../app/journal.tsx', import.meta.url), 'utf8');
const radio = readFileSync(new URL('../app/radio-track.tsx', import.meta.url), 'utf8');
const content = readFileSync(new URL('../app/content.ts', import.meta.url), 'utf8');
const css = readFileSync(new URL('../app/globals.css', import.meta.url), 'utf8');

test('all radios including Nova can show identifiable songs in the cards', () => {
  assert.match(journal, /<RadioTrack metadata=\{item\.metadata\} compact/);
  assert.doesNotMatch(journal, /item\.metadata\.provider !== 'nova-page'/);
  assert.match(radio, /track\?\.kind==='last-confirmed'/);
  assert.match(radio, /À \{track\.playedAt\}, selon Nova/);
  assert.match(journal, /<RadioTrack metadata=\{item\.metadata\} compact/);
  assert.match(journal, /<RadioTrack metadata=\{item\.metadata\} compact/);
  assert.match(radio, /className="station-track-title">\{track\.title\}/);
  assert.match(radio, /className="station-track-artist">\{track\.artist\}/);
  assert.match(radio, /'Recherche du titre en cours…'/);
  assert.match(radio, /'Titre non confirmé par la station pour le moment.'/);
});

test('NTS and Worldwide FM cards show the current broadcast and not a song-saving button', () => {
  assert.match(radio, /channel\.channel_name === metadata\.channel/);
  assert.match(radio, /now\?\.broadcast_title/);
  assert.match(radio, /const isShow = isNts \|\| metadata\?\.provider === 'radiocult-live'/);
  assert.match(radio, /return parseRadioCultShow\(await response\.json\(\)\)/);
  assert.match(radio, /isShow \? 'ÉMISSION EN DIRECT'/);
  assert.match(radio, /!isShow && trackForSave && saveTrack\(trackForSave\)/);
  assert.ok(content.includes("name: 'NTS 1'"));
  assert.ok(content.includes("name: 'NTS 2'"));
});

test('saved tracks from radio cards retain their own station provenance', () => {
  assert.match(journal, /currentRadioTrack\(track, item\.name\)/);
  assert.match(journal, /currentRadioTrack\(track, station\.name\)/);
  assert.match(journal, /source: sourceName/);
  assert.match(journal, /radio-track:' \+ JSON\.stringify/);
});

test('card polls are less frequent than expanded player polls and layout is responsive', () => {
  assert.match(radio, /compact \? 30_000 : 15_000/);
  assert.match(radio, /parseSpinitronReader|parseCampusParisReader/);
  assert.match(css, /\.station-now-playing \{/);
  assert.match(css, /\.station-track-title \{/);
  assert.match(css, /\.station-track-artist \{/);
});

test('a radio begins playing on the same click and never waits for a newly mounted player', () => {
  const tuneStart = journal.indexOf('const tune = (next: typeof station) => {');
  const tuneEnd = journal.indexOf('const saveButton = ', tuneStart);
  assert.ok(tuneStart > 0 && tuneEnd > tuneStart);
  const tune = journal.slice(tuneStart, tuneEnd);
  assert.ok(tune.includes('radioAudioRef.current'));
  assert.ok(tune.includes('audio.play()'));
  assert.ok(tune.indexOf('audio.play()') < tune.indexOf('setRadioOpen(true)'));
  assert.ok(journal.includes('<audio ref={radioAudioRef} controls preload="none"'));
  assert.ok(journal.includes('className="dock-expanded" hidden={!radioOpen}'));
  assert.ok(journal.includes('onClick={stopRadio}'));
  assert.ok(journal.includes('audio.pause()'));
  assert.ok(css.includes('.dock-expanded[hidden] { display: none; }'));
  assert.ok(css.includes('.dock-expanded audio[hidden] { display: none; }'));
  assert.ok(!journal.includes('<audio key={station.stream}'));
});

test('all five FIP stations use the official HLS feeds rather than ad-preroll MP3 streams', () => {
  for (const slug of ['fiprock', 'fipjazz', 'fipgroove', 'fipelectro'])
    assert.ok(content.includes("'" + slug + "'"));
  assert.ok(content.includes("stream: 'https://stream.radiofrance.fr/' + fipStreams[station] + '/' + fipStreams[station] + '_hifi.m3u8'"));
  assert.ok(content.includes("stream: 'https://stream.radiofrance.fr/fip/fip_hifi.m3u8'"));
  assert.doesNotMatch(content, /icecast\.radiofrance\.fr/);
  assert.doesNotMatch(content, /embed: 'https:\/\/embed\.radiofrance\.fr\/fip\/player\?id_station=' \+ station/);
});

test('NTS and Worldwide FM always display their station logos instead of song artwork', () => {
  assert.match(radio, /const stationLogo = isNts/);
  assert.match(radio, /NTS-Logo-Black\.png/);
  assert.match(radio, /worldwidefm\.net\/image-placeholder\.png/);
  assert.match(radio, /const cover = stationLogo \? <img className="station-cover station-logo"/);
  assert.match(radio, /: displayedArtwork \? <div className="station-cover-group">/);
  assert.match(radio, /: stationLogo \? <div className="station-track-layout">\{cover\}/);
});
