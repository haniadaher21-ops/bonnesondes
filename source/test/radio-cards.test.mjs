import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const journal = readFileSync(new URL('../app/journal.tsx', import.meta.url), 'utf8');
const radio = readFileSync(new URL('../app/radio-track.tsx', import.meta.url), 'utf8');
const content = readFileSync(new URL('../app/content.ts', import.meta.url), 'utf8');
const css = readFileSync(new URL('../app/globals.css', import.meta.url), 'utf8');

test('all radios including Nova can show identifiable songs in the cards', () => {
  assert.match(journal, /\{item\.metadata\s+\? <RadioTrack/);
  assert.doesNotMatch(journal, /item\.metadata\.provider !== 'nova-page'/);
  assert.match(radio, /isNova \? 'DERNIER TITRE DIFFUSÉ'/);
  assert.match(radio, /À \{track\.playedAt\}, selon Nova/);
  assert.match(journal, /<RadioTrack metadata=\{item\.metadata\} compact/);
  assert.match(journal, /: <p className="station-description">\{item\.description\}<\/p>/);
  assert.match(radio, /className="station-track-title">\{track\.title\}/);
  assert.match(radio, /className="station-track-artist">\{track\.artist\}/);
  assert.match(radio, /'Chargement du direct…'/);
  assert.match(radio, /'Titre indisponible pour le moment.'/);
});

test('NTS cards show the current broadcast and not a song-saving button', () => {
  assert.match(radio, /channel\.channel_name === metadata\.channel/);
  assert.match(radio, /now\?\.broadcast_title/);
  assert.match(radio, /isNts \? 'ÉMISSION EN DIRECT'/);
  assert.match(radio, /!isNts && trackForSave && saveTrack\(trackForSave\)/);
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
  assert.doesNotMatch(journal, /<audio key=\\{station\\.stream\\}/);
});

test('the four themed FIP stations use their documented direct Radio France streams', () => {
  for (const slug of ['fiprock', 'fipjazz', 'fipgroove', 'fipelectro'])
    assert.ok(content.includes("'" + slug + "'"));
  assert.ok(content.includes("stream: 'https://icecast.radiofrance.fr/' + fipStreams[station] + '-midfi.mp3?id=openapi'"));
  assert.doesNotMatch(content, /embed: 'https:\/\/embed\.radiofrance\.fr\/fip\/player\?id_station=' \+ station/);
});
