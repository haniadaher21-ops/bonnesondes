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
