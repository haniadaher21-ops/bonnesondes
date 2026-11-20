import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { radioArtworkUrl } from '../app/radio-artwork.mjs';

const page=readFileSync(new URL('../app/journal.tsx',import.meta.url),'utf8');
const player=readFileSync(new URL('../app/radio-track.tsx',import.meta.url),'utf8');
const css=readFileSync(new URL('../app/globals.css',import.meta.url),'utf8');

test('subtitles under every tab page heading are removed, not replaced by empty markup',()=>{
  assert.equal([...page.matchAll(/<PageHeading\b/g)].length,8);
  assert.doesNotMatch(page,/<PageHeading[^>]*\snote=/);
  assert.match(page,/function PageHeading\(\{ label, title \}: \{ label: string; title: string \}\)/);
  assert.match(page,/<h1>\{title\}<span>\.<\/span><\/h1><\/header>/);
  assert.doesNotMatch(page,/<p>\{note\}<\/p>/);
  assert.doesNotMatch(css,/\.page-heading > p:last-child/);
});

test('radio cover is only displayed when official now-playing metadata includes a safe HTTPS image',()=>{
  assert.match(player,/visual\?: string/);
  assert.match(player,/artwork: radioArtworkUrl\(current.visual\)/);
  assert.match(player,/artwork: radioArtworkUrl\(song.art\)/);
  assert.match(player,/track.artwork && <BroadcastArtwork key=\{track.artwork\}/);
  assert.match(player,/className="station-cover"/);
  assert.match(player,/onError=\{\(\) => setFailed\(true\)\}/);
  assert.match(css,/\.station-cover \{/);
  assert.match(css,/object-fit: cover/);
});

test('album artwork is safely normalized or rejected without making up a cover',()=>{
  assert.equal(radioArtworkUrl('https://covers.radiofrance.fr/album/400x400.jpg'),
    'https://covers.radiofrance.fr/album/400x400.jpg');
  assert.equal(radioArtworkUrl('http://covers.radiofrance.fr/album.jpg'),undefined);
  assert.equal(radioArtworkUrl('javascript:alert(1)'),undefined);
  assert.equal(radioArtworkUrl('data:image/svg+xml,test'),undefined);
  assert.equal(radioArtworkUrl('https://user:pass@radio.fr/cover.jpg'),undefined);
  assert.equal(radioArtworkUrl(undefined),undefined);
  assert.equal(radioArtworkUrl('not-an-url'),undefined);
});

test('album covers accompany saved radio songs while station provenance and NTS behavior remain unchanged',()=>{
  assert.match(page,/currentRadioTrack = \(\{ title, artist, artwork \}: OnAir, sourceName: string\)/);
  assert.match(page,/format: 'Track',\s+artwork,\s+source: sourceName/);
  assert.match(page,/radioTracks: item.format === 'Track' && saved/);
  assert.match(player,/!isNts && saveTrack\(track\)/);
  assert.match(player,/isNts \? 'ÉMISSION EN DIRECT'/);
  assert.doesNotMatch(page,/item.metadata.provider !== 'nova-page'/);
  assert.match(page,/item.metadata\s+\? <RadioTrack/);
  assert.match(page,/<p className="station-description">\{item.description\}<\/p>/);
});
