import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const journal = readFileSync(new URL('../app/journal.tsx', import.meta.url), 'utf8');
const hls = readFileSync(new URL('../app/hls-radio.ts', import.meta.url), 'utf8');
const stations = readFileSync(new URL('../app/content.ts', import.meta.url), 'utf8');

test('the five FIP feeds are official HLS playlists with no MP3 ad pre-roll route', () => {
  assert.match(stations, /stream: 'https:\/\/stream\.radiofrance\.fr\/fip\/fip_hifi\.m3u8'/);
  assert.match(stations, /fipStreams\[station\] \+ '_hifi\.m3u8'/);
  for (const slug of ['fiprock','fipjazz','fipgroove','fipelectro']) assert.ok(stations.includes(slug));
  assert.doesNotMatch(stations, /icecast\.radiofrance\.fr/);
  assert.doesNotMatch(stations, /fip-midfi\.mp3/);
});

test('HLS support is native on Safari and uses a pinned HLS.js version elsewhere', () => {
  assert.match(hls, /hls\.js@1\.7\.4\/dist\/hls\.min\.js/);
  assert.match(journal, /supportsNativeHls\(audio\)/);
  assert.match(journal, /loadHlsLibrary\(\)\.then\(Hls/);
  assert.match(journal, /new Hls\(\{ enableWorker: true \}\)/);
  assert.match(journal, /hls\.loadSource\(next\.stream!\)/);
  assert.match(journal, /hls\.attachMedia\(audio\)/);
  assert.match(journal, /hls\.on\(Hls\.Events\.ERROR/);
});

test('changing streams or closing the dock disposes the old HLS instance', () => {
  assert.match(journal, /const radioPlaybackGeneration = useRef\(0\)/);
  assert.match(journal, /radioPlaybackGeneration\.current \+= 1/);
  assert.match(journal, /const request = \+\+radioPlaybackGeneration\.current/);
  assert.ok((journal.match(/hlsRadioRef\.current\?\.destroy\(\)/g) ?? []).length >= 2);
  assert.match(journal, /if \(request !== radioPlaybackGeneration\.current\) return/);
  assert.match(journal, /if \(page === 'radio'\) void loadHlsLibrary/);
  assert.ok(journal.indexOf('hls.attachMedia(audio)') < journal.indexOf('setRadioOpen(true)',journal.indexOf('const tune = ')));
});

test('playback errors cannot quietly revert to MP3 advertising streams', () => {
  assert.match(journal, /Le direct FIP ne peut pas démarrer dans ce navigateur/);
  assert.doesNotMatch(journal, /fallback.*icecast|icecast.*fallback/);
  assert.match(hls, /script\.onerror =/);
  assert.match(journal, /setAudioError\(true\)/);
});
