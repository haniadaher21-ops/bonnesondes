import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import {
  emptyTasteProfile, normalizeTasteProfile, parseTasteProfile, spotifyPreferencesFromText, importWeightedTaste,
  tasteProfileForExport, tasteProfileKey,
} from '../editorial/taste-profile.mjs';

test('the profile defaults to no inferred tastes and the discovery fixture uses the same contract', () => {
  const fixture = readFileSync(new URL('../editorial/taste-profile.example.json', import.meta.url), 'utf8');
  assert.deepEqual(parseTasteProfile(fixture), emptyTasteProfile());
  assert.notEqual(tasteProfileKey, 'off-frequency.library.v1');
});

test('manual preferences round-trip and Spotify links stay canonical and credential-free', () => {
  const profile = normalizeTasteProfile({
    ...emptyTasteProfile(),
    favoriteArtists: [' Alice Coltrane ', 'alice coltrane'], favoriteRadios: ['NTS'],
    favoritePublications: ['The Quietus'], explore: ['Dub'], avoid: ['Hardstyle'],
    spotify: spotifyPreferencesFromText([
      'Mr Bongo | https://open.spotify.com/intl-fr/playlist/64WCJyxoGnhFHdDe6LYwNG?si=tracking#part',
      'https://open.spotify.com/playlist/64WCJyxoGnhFHdDe6LYwNG',
      'https://open.spotify.com/user/curator.example',
    ].join('\n')),
  });
  assert.deepEqual(parseTasteProfile(JSON.stringify(profile)), {
    version: 1,
    favoriteArtists: ['Alice Coltrane'], favoriteRadios: ['NTS'], favoritePublications: ['The Quietus'],
    explore: ['Dub'], avoid: ['Hardstyle'],
    spotify: [
      { kind: 'playlist', name: 'Mr Bongo', url: 'https://open.spotify.com/playlist/64WCJyxoGnhFHdDe6LYwNG' },
      { kind: 'curator', url: 'https://open.spotify.com/user/curator.example' },
    ],
    signals: { curators: [], items: [] },
  });
});

test('unknown versions and unsupported or credential-bearing URLs are rejected', () => {
  assert.throws(() => normalizeTasteProfile({ ...emptyTasteProfile(), version: 2 }), /Version/);
  for (const url of [
    'https://open.spotify.com.evil.example/user/curator',
    'https://user:password@open.spotify.com/user/curator',
    'https://open.spotify.com/track/64WCJyxoGnhFHdDe6LYwNG',
  ]) {
    assert.throws(() => normalizeTasteProfile({ ...emptyTasteProfile(), spotify: [{ url }] }), /lien Spotify/);
  }
});

test('collection feedback is optional, preserves IDs, and exports only ranking fields', () => {
  const profile = normalizeTasteProfile({
    ...emptyTasteProfile(),
    signals: { curators: ['Disquaire'], items: [{ id: 'removed', saved: true }, { id: 'imported', saved: true }] },
  });
  const library = {
    curators: ['Disquaire'],
    entries: {
      'spotify-favorite': { saved: true, listened: true },
      'youtube-other': { saved: false, reaction: 'Not for me' },
      'spotify-loved': { reaction: 'Loved' },
      removed: { saved: false },
      listened: { listened: true },
    },
  };
  const before = structuredClone(library);
  const recommendations = [{
    id: 'spotify-favorite', creator: 'Artiste', genre: 'Jazz', url: 'https://example.com', title: 'Privé',
  }];
  assert.deepEqual(tasteProfileForExport(profile, library, recommendations, false).signals, { curators: [], items: [] });
  const exported = tasteProfileForExport(profile, library, recommendations, true);
  assert.deepEqual(exported.signals, {
    curators: ['Disquaire'],
    items: [
      { id: 'imported', saved: true },
      { id: 'spotify-favorite', saved: true, creator: 'Artiste', genre: 'Jazz' },
      { id: 'youtube-other', saved: false, reaction: 'Not for me' },
      { id: 'spotify-loved', saved: false, reaction: 'Loved' },
    ],
  });
  assert.deepEqual(parseTasteProfile(JSON.stringify(exported)), exported);
  assert.deepEqual(library, before);
});

 test('weighted profiles preserve existing preferences and strip raw listening fields',()=>{
 const raw={artists:[{artist:'Example A',score:85,history:['private'],recent_minutes:123},{artist:'example a',score:50}],excluded_artists:['Example B'],known_artist_names:['Example A','Example B'],known_tracks_normalized:['private track'],history_start:'2026-01-01'};
 const base={...emptyTasteProfile(),favoriteArtists:['Manual favorite'],weightedProfile:raw};
 const clean=normalizeTasteProfile(base);
 assert.deepEqual(clean.weightedProfile,{artists:[{artist:'Example A',score:85}],excluded_artists:['Example B'],known_artist_names:['Example A','Example B']});
 assert.deepEqual(clean.favoriteArtists,['Manual favorite']);
 assert.deepEqual(parseTasteProfile(JSON.stringify(clean)),clean);
 assert.throws(()=>normalizeTasteProfile({...base,weightedProfile:{...raw,artists:[{artist:'Example A',score:101}]}}),/Score musical/);
 });

test('full derived profile imports without truncation or replacement of manual preferences',()=>{
 const artists=Array.from({length:1570},(_,i)=>({artist:'Fixture '+i,score:Math.max(.5,100-i/16)}));
 const base=normalizeTasteProfile({...emptyTasteProfile(),favoriteArtists:['Manual favorite'],signals:{curators:['Manual curator'],items:[{id:'one',saved:true}]}});
 const next=importWeightedTaste(base,{type:'bonnes-ondes-weighted-profile',version:1,weightedProfile:{artists,excluded_artists:[],known_artist_names:artists.map(x=>x.artist)}});
 assert.equal(next.weightedProfile.artists.length,1570);
 assert.equal(next.weightedProfile.artists.at(-1).score,artists.at(-1).score);
 assert.deepEqual(next.favoriteArtists,base.favoriteArtists);
 assert.deepEqual(next.signals,base.signals);
 assert.deepEqual(parseTasteProfile(JSON.stringify(next)),next);
 assert.throws(()=>importWeightedTaste(base,{type:'bonnes-ondes-weighted-profile',version:1,weightedProfile:{artists:Array.from({length:2001},()=>artists[0]),excluded_artists:[],known_artist_names:[]}}),/invalide/);
});
