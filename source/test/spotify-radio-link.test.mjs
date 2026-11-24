import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spotifyRadioSearchUrl } from '../app/spotify-radio-link.mjs';

test('an identified radio song opens a Spotify search for its artist and title', () => {
  assert.equal(spotifyRadioSearchUrl('Riparian B', 'Eyvind Kang'),
    'https://open.spotify.com/search/Eyvind%20Kang%20Riparian%20B');
  assert.equal(spotifyRadioSearchUrl('  A   Song  ', '  Artist  '),
    'https://open.spotify.com/search/Artist%20A%20Song');
  assert.equal(spotifyRadioSearchUrl('Le cœur', 'Léa & les autres'),
    'https://open.spotify.com/search/L%C3%A9a%20%26%20les%20autres%20Le%20c%C5%93ur');
});

test('do not show a misleading Spotify song link without a title and artist', () => {
  for (const [title,artist] of [['Radio Show',undefined],['', 'Artist'],['Song','   '],[null,'Artist']]) {
    assert.equal(spotifyRadioSearchUrl(title,artist), null);
  }
});

test('Spotify link appears in compact cards and expanded player, not on NTS broadcasts', () => {
  const source=readFileSync(new URL('../app/radio-track.tsx',import.meta.url),'utf8');
  const css=readFileSync(new URL('../app/globals.css',import.meta.url),'utf8');
  assert.ok(source.includes("const spotifyUrl = !isNts && track?.artist ? spotifyRadioSearchUrl(track.title, track.artist) : null;"));
  assert.equal((source.match(/className="radio-spotify-link"/g) ?? []).length, 2);
  assert.equal((source.match(/rel="noopener noreferrer"/g) ?? []).length >= 2, true);
  assert.match(source, /aria-label=\{'Rechercher ' \+ track.title \+ ' de ' \+ track.artist \+ ' sur Spotify'\}/);
  assert.match(css,/\.radio-spotify-link \{/);
});
