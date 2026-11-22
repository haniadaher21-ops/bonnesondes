import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';

const ui=readFileSync(new URL('../app/journal.tsx',import.meta.url),'utf8');
const css=readFileSync(new URL('../app/globals.css',import.meta.url),'utf8');

test('all YouTube mixes and lives get a thumbnail from their video ID, even with no artwork field',()=>{
  assert.match(ui,/youtubeThumbnailCandidates\(item\.embed\?\.provider === 'youtube' \? item\.embed\.id : undefined\)/);
  assert.match(ui,/thumbnails\.length \? thumbnails\[thumbnailAttempt\] : item\.artwork/);
  assert.match(ui,/setThumbnailAttempt\(attempt => attempt \+ 1\)/);
  assert.match(ui,/<img key=\{artworkUrl\} src=\{artworkUrl\}/);
});
test('video tile aspect ratio remains 16:9 with image filling the whole frame and no black letterbox strip',()=>{
  assert.match(css,/\.video-launch \{[^\n]*aspect-ratio: 16 \/ 9;/);
  assert.match(css,/\.video-launch \.artwork, \.music-card-compact \.video-launch \.artwork \{/);
  assert.match(css,/position: absolute; inset: 0; display: grid;/);
  assert.match(css,/\.video-launch \.artwork img \{/);
  assert.match(css,/object-fit: cover; object-position: center/);
  assert.doesNotMatch(css,/\.video-launch \.artwork \{ aspect-ratio: 16 \/ 9; \}/);
});
