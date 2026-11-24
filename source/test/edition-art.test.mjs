import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import imageBank from '../editorial/image-bank.json' with { type: 'json' };
import legacy from '../editorial/legacy.json' with { type: 'json' };
import editions from '../editorial/editions.json' with { type: 'json' };
import { editionImage, editionImagePath, nextEditionImageId } from '../editorial/edition-art.mjs';

test('Drive photos remain valid JPG assets even after future automatic imports', () => {
  assert.ok(imageBank.images.length >= 7);
  const seen = new Set();
  for (const image of imageBank.images) {
    assert.ok(image.id && !seen.has(image.id));
    seen.add(image.id);
    assert.match(image.file, /^\/edition-images\/[a-z0-9-]+\.jpg$/);
    assert.ok(typeof image.alt === 'string' && image.alt.length > 20);
    if (image.driveFileId) assert.match(image.driveFileId, /^[a-zA-Z0-9_-]+$/);
    else {
      assert.match(image.sourceSha256, /^[a-f0-9]{64}$/);
      assert.ok(image.sourceName);
    }
    const file = new URL('../public' + image.file, import.meta.url);
    assert.ok(statSync(file).size > 100, image.id);
    const bytes = readFileSync(file);
    assert.equal(bytes[0], 0xff);
    assert.equal(bytes[1], 0xd8);
  }
});

test('current and archived issues retain their own illustration forever', () => {
  assert.equal(legacy.coverImageId, 'dog-dj');
  assert.equal(editions[0].coverImageId, 'disco-night');
  assert.ok(editionImagePath(legacy.coverImageId)?.endsWith('/dog-dj.jpg'));
  assert.ok(editionImagePath(editions[0].coverImageId)?.endsWith('/disco-night.jpg'));
  assert.equal(editionImage('nonexistent'),null);
});

test('new editions pick each unused picture before a second rotation', () => {
  let history = [legacy, ...editions];
  const picks = [];
  for (let i = 0; i < imageBank.images.length - 2; i++) {
    const chosen=nextEditionImageId(history);
    assert.ok(!history.some(edition=>edition.coverImageId===chosen));
    picks.push(chosen);
    history=[...history,{number:String(i + 3),coverImageId:chosen}];
  }
  assert.equal(new Set(picks).size,5);
  const repeated = nextEditionImageId(history);
  assert.ok(imageBank.images.some(image => image.id === repeated));
  assert.notEqual(repeated, history.at(-1).coverImageId);
});

test('new bank entries cannot modify the image of a previously published issue',()=>{
  const extended=[...imageBank.images,{id:'new-photo',file:'/edition-images/new-photo.jpg'}];
  const original=[legacy,...editions];
  const history=[...original,...imageBank.images
    .filter(x=>!original.some(y=>y.coverImageId===x.id))
    .map(x=>({coverImageId:x.id}))];
  assert.equal(nextEditionImageId(history, extended),'new-photo');
  assert.equal(original[0].coverImageId,'dog-dj');
  assert.equal(original[1].coverImageId,'disco-night');
});

test('homepage, archives and publication tools all use edition-specific artwork',()=>{
  const page=readFileSync(new URL('../app/journal.tsx',import.meta.url),'utf8');
  const policy=readFileSync(new URL('../scripts/automation-policy.mjs',import.meta.url),'utf8');
  const preparation=readFileSync(new URL('../scripts/prepare-edition.mjs',import.meta.url),'utf8');
  const content=readFileSync(new URL('../app/content.ts',import.meta.url),'utf8');
  assert.match(page,/editionCover\(weeklyArtId\)\.src/);
  assert.match(page,/editionCover\(archivedIssue\.coverImageId\)\.src/);
  assert.match(page,/editionCover\(edition\.coverImageId\)\.src/);
  assert.match(policy,/draft\.coverImageId = nextEditionImageId\(earlier\)/);
  assert.match(preparation,/candidate\.coverImageId \?\? nextEditionImageId/);
  assert.match(content,/coverImageId\?: string/);
});
