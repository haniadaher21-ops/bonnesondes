import assert from 'node:assert/strict';
import {test} from 'node:test';
import {playableYouTubeId,youtubeEmbedSrc} from '../app/youtube-player.mjs';

test('only a valid YouTube video ID can initialize the persistent player',()=>{
  assert.equal(playableYouTubeId('K6en74gqBSM'),true);
  assert.equal(playableYouTubeId('XQoGtWdpKoA'),true);
  for(const value of ['',undefined,'../../secrets','x'.repeat(12),'abc?autoplay=0','https://youtu.be/K6en74gqBSM']){
    assert.equal(playableYouTubeId(value),false);
    assert.equal(youtubeEmbedSrc(value),undefined);
  }
});
test('YouTube player uses a single direct embed with explicit user-started autoplay',()=>{
  assert.equal(youtubeEmbedSrc('K6en74gqBSM'),
    'https://www.youtube.com/embed/K6en74gqBSM?autoplay=1&playsinline=1&rel=0');
});
