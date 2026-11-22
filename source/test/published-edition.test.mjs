import assert from 'node:assert/strict';
import {test} from 'node:test';
import editions from '../editorial/editions.json' with {type:'json'};
import {legacyEdition,legacyItems} from '../scripts/editorial-files.mjs';
import {validateEdition,selectEdition} from '../editorial/edition.mjs';
import {isNtsMix,isNovaMix,isYouTubeMix} from '../scripts/recommendation-policy.mjs';

test('edition 002 is manually published today with the exact verified preview content',()=>{
  const item=editions.find(edition=>edition.number==='002');
  assert.ok(item,'The approved edition must be committed to the public journal');
  assert.equal(item.startsOn,'2026-11-23');
  assert.equal(item.publishedAt,'2026-11-22');
  assert.deepEqual(validateEdition(item,[legacyEdition],legacyItems),[]);
  assert.deepEqual(item.albums.map(x=>x.title),['All My Friends','Trouble Mountain','Mek Do & Mend']);
  assert.deepEqual(item.albums.map(x=>x.creator),['Chastity Belt','Aesop Rock & Blockhead','Wonky Logic']);
  assert.deepEqual(item.albums.map(x=>x.date),['2026-11-06','2026-11-13','2026-11-11']);
  assert.equal(item.albums[0].editorialException,true);
  assert.ok(item.albums[0].editorialExceptionReason.length>=20);
  const staleAlbum=structuredClone(item);
  staleAlbum.albums[2].date='2025-11-28';
  assert.match(validateEdition(staleAlbum,[legacyEdition],legacyItems).join('\\n'),/Album trop ancien/);
  assert.deepEqual(item.mixes.slice(0,3).map(x=>x.sourceId),[
    'nts-can-you-feel-the-sun','nova-danse','youtube-mix-UC0QX1jatZgGGYkF7xXCcF8Q']);
  assert.equal(item.mixes.filter(isNtsMix).length,1);
  assert.equal(item.mixes.filter(isNovaMix).length,1);
  assert.equal(item.mixes.filter(isYouTubeMix).length,1);
  assert.deepEqual(item.mixes.slice(3).map(x=>[x.id,x.title,x.date,x.sourceId]),[
    ['fip-tape-gta-8454740','La mixtape de GTA','2026-11-12','fip-tape'],
    ['fip-tape-james-blake-7762098','La mixtape de James Blake','2026-10-08','fip-tape'],
  ]);
  assert.ok(item.mixes.slice(3).every(x=>x.url.startsWith('https://www.radiofrance.fr/fip/podcasts/fip-tape/')));
  // Every mix currently shown has its official episode thumbnail, not an icon fallback.
  assert.ok(item.mixes.every(x=>x.artwork?.startsWith('https://')));
  assert.deepEqual(item.mixes.filter(x=>x.audio).map(x=>[x.id,x.audio.provider]),[
    ['nts-canyoufeelthesun-w-call-super-parris-19th-november-2026','soundcloud'],
    ['nova-danse:/radio-nova-nova-danse/202611132200-nova-danse-1tbsp-x-miki','podcast'],
    ['fip-tape-gta-8454740','podcast'],
    ['fip-tape-james-blake-7762098','podcast'],
  ]);
  const invalidAudio=structuredClone(item);
  invalidAudio.mixes[3].audio.url='https://example.com/other.mp3';
  assert.match(validateEdition(invalidAudio,[legacyEdition],legacyItems).join('\\n'),/Lecteur audio non vérifié/);

  assert.equal(item.mixes[1].artwork,'https://assets.voxeus.com/podcasts/assets/images/rs/episode/256/b3f968098869702de1abce2c7345c26e3594b6dc/69c15e4f-d57a-4d27-8cdc-c98fd2c7b261/6e501dc4b799a8436666ccff909e65e18102c05d.png');
  assert.deepEqual(item.mixes.slice(3).map(x=>x.artwork),[
    'https://www.radiofrance.fr/pikapi/images/e9dd2af8-857b-4877-80dc-08b4f0ad070e/800x800',
    'https://www.radiofrance.fr/pikapi/images/77211fb5-7875-4dd4-b42d-784c79233f0e/800x800',
  ]);
  const unverified = structuredClone(item);
  unverified.mixes[3].url='https://example.org/not-a-fip-tape';
  assert.match(validateEdition(unverified,[legacyEdition],legacyItems).join('\\n'),/FIP Tape vérifiés/);
  assert.equal(item.mixes[2].embed.id,'XQoGtWdpKoA');
  assert.ok(item.mixes[2].viewCount >= 100000);
  assert.ok(item.albums.every(x=>x.artwork?.startsWith('https://')&&x.url.startsWith('https://open.spotify.com/album/')));
  assert.equal(item.live.length,3);
  assert.equal(new Set(item.live.map(x=>x.source)).size,3);
  assert.equal(selectEdition([legacyEdition,item],new Date('2026-11-22T21:00:00Z')),item);
  assert.equal(selectEdition([legacyEdition,item],new Date('2026-11-23T07:00:00Z')),item);
});
