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
  assert.deepEqual(item.albums.map(x=>x.title),['All My Friends','Appalachia','SAD']);
  assert.deepEqual(item.mixes.map(x=>x.sourceId),[
    'nts-can-you-feel-the-sun','nova-danse','youtube-mix-UC0QX1jatZgGGYkF7xXCcF8Q']);
  assert.equal(item.mixes.filter(isNtsMix).length,1);
  assert.equal(item.mixes.filter(isNovaMix).length,1);
  assert.equal(item.mixes.filter(isYouTubeMix).length,1);
  assert.equal(item.mixes[2].embed.id,'XQoGtWdpKoA');
  assert.ok(item.mixes[2].viewCount >= 100000);
  assert.ok(item.albums.every(x=>x.artwork?.startsWith('https://')&&x.url.startsWith('https://open.spotify.com/album/')));
  assert.equal(item.live.length,3);
  assert.equal(new Set(item.live.map(x=>x.source)).size,3);
  assert.equal(selectEdition([legacyEdition,item],new Date('2026-11-22T21:00:00Z')),item);
  assert.equal(selectEdition([legacyEdition,item],new Date('2026-11-23T07:00:00Z')),item);
});
