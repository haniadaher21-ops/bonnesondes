import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('Spinitron widget fallback is limited to three approved campus stations', () => {
  const stations=readFileSync(new URL('../app/content.ts',import.meta.url),'utf8');
  const player=readFileSync(new URL('../app/radio-track.tsx',import.meta.url),'utf8');
  const css=readFileSync(new URL('../app/globals.css',import.meta.url),'utf8');
  for(const code of ['KALX','WRBB','KZSC']) {
    assert.match(stations,new RegExp("stationCode:'"+code+"'"));
  }
  assert.equal((stations.match(/stationCode:/g)??[]).length,3);
  assert.match(player,/widgets\.spinitron\.com\/widget\/now-playing-v2\?station=/);
  assert.match(player,/spinitronWidgetUrl && !track/);
  assert.match(player,/<iframe title="Dernier titre diffusé selon Spinitron"/);
  assert.match(player,/loading="lazy" referrerPolicy="strict-origin-when-cross-origin"/);
  assert.match(css,/\.station-spinitron-frame \{/);
  assert.doesNotMatch(player,/icecast\.radiofrance/);
});

test('radio category changes preserve seven campus and twelve main stations',()=>{
 const stations=readFileSync(new URL('../app/content.ts',import.meta.url),'utf8');
 assert.equal((stations.match(/category: 'campus'/g)??[]).length,7);
 assert.doesNotMatch(stations,/name: 'Radio Campus Paris'/);
 assert.match(stations,/name: 'Worldwide FM', label:/);
 const page=readFileSync(new URL('../app/journal.tsx',import.meta.url),'utf8');
 assert.match(page,/page === 'campus'\s*\? item\.category === 'campus'/);
 assert.match(page,/visibleStationNames/);
});

test('unreliable WFMU and WNUR metadata links remain transparent',()=>{
 const stations=readFileSync(new URL('../app/content.ts',import.meta.url),'utf8');
 const page=readFileSync(new URL('../app/journal.tsx',import.meta.url),'utf8');
 assert.match(stations,/playlistUrl: 'https:\/\/wfmu\.org\/now-playing-widget\.html'/);
 assert.match(stations,/playlistUrl: 'https:\/\/www\.wnur\.org\/recent-playlists'/);
 assert.match(page,/!item\.metadata && item\.playlistUrl/);
});
