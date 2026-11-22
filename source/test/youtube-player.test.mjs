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

test('video thumbnails use 16:9 YouTube images first, with reliable fallbacks',async()=>{
  const {youtubeThumbnailCandidates}=await import('../app/youtube-player.mjs');
  assert.deepEqual(youtubeThumbnailCandidates('XQoGtWdpKoA'),[
    'https://i.ytimg.com/vi/XQoGtWdpKoA/hq720.jpg',
    'https://i.ytimg.com/vi/XQoGtWdpKoA/mqdefault.jpg',
    'https://i.ytimg.com/vi/XQoGtWdpKoA/hqdefault.jpg',
  ]);
  assert.deepEqual(youtubeThumbnailCandidates(undefined),[]);
  assert.deepEqual(youtubeThumbnailCandidates('../../invalid'),[]);
});
