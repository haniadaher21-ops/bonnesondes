import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { installRadioMediaSession } from '../app/radio-media-session.mjs';

class MockAudio extends EventTarget {
  paused = true;
  plays = 0;
  pauses = 0;
  play() {
    this.paused = false;
    this.plays++;
    this.dispatchEvent(new Event('playing'));
    return Promise.resolve();
  }
  pause() {
    this.paused = true;
    this.pauses++;
    this.dispatchEvent(new Event('pause'));
  }
}

class FakeMetadata {
  constructor(data) { Object.assign(this, data); }
}

test('hardware Pause/Play controls the actual HTML audio element, even for HLS', async () => {
  const audio = new MockAudio();
  const handlers = new Map();
  const session = {
    metadata: null, playbackState: 'none',
    setActionHandler(name, handler) { if (handler) handlers.set(name, handler); else handlers.delete(name); },
  };
  const cleanup = installRadioMediaSession(audio, 'FIP Jazz', {session,Metadata:FakeMetadata,artwork:'/bonnesondes/bonnes-ondes-mark.svg'});
  assert.equal(session.metadata.title,'FIP Jazz');
  assert.equal(session.playbackState,'paused');
  assert.equal(handlers.size,3);
  await audio.play();
  assert.equal(session.playbackState,'playing');
  handlers.get('pause')();
  assert.equal(audio.paused,true);
  assert.equal(session.playbackState,'paused');
  handlers.get('play')();
  await Promise.resolve();
  assert.equal(audio.plays,2);
  assert.equal(session.playbackState,'playing');
  cleanup();
  assert.equal(session.metadata,null);
  assert.equal(session.playbackState,'none');
  assert.equal(handlers.size,0);
});

test('unsupported Media Session API is harmless for normal audio controls',()=>{
  const audio = new MockAudio();
  const cleanup=installRadioMediaSession(audio,'Radio Nova',{session:null});
  assert.equal(typeof cleanup,'function');
  cleanup();
});

test('optional stop action and unsupported Safari actions fail safely',()=>{
  const audio = new MockAudio();
  const handlers=new Map();
  const session={
    metadata:null, playbackState:'none',
    setActionHandler(name,fn) {
      if(name==='stop')throw Error('Unsupported on this browser');
      if(fn)handlers.set(name,fn);
      else handlers.delete(name);
    }
  };
  const cleanup=installRadioMediaSession(audio,'KALX',{session,Metadata:FakeMetadata});
  assert.equal(handlers.has('pause'),true);
  assert.equal(handlers.has('play'),true);
  cleanup();
  assert.equal(handlers.size,0);
});

test('the radio dock uses media keys while its audio remains mounted across navigation',()=>{
  const page=readFileSync(new URL('../app/journal.tsx',import.meta.url),'utf8');
  assert.match(page,/installRadioMediaSession\(audio, station\.name/);
  assert.match(page,/if \(!radioOpen \|\| activeMix \|\| activeVideo\) return/);
  assert.match(page,/return installRadioMediaSession/);
  assert.match(page,/<audio ref=\{radioAudioRef\} controls/);
  assert.match(page,/stopRadio\(\)/);
});
