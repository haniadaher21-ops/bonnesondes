import test from 'node:test';
import assert from 'node:assert/strict';
import { parseRadioCultShow, parseWorldwideSchedule } from './campus-nowplaying.mjs';

test('Worldwide uses programme title, never recognised song or stream metadata', () => {
  assert.deepEqual(parseRadioCultShow({success:true,result:{status:'schedule',content:{title:'  Jassmine  '},metadata:{title:'Wrong title',artist:'Wrong artist'},musicRecognition:{status:'match',title:'Wrong track'}}}),{title:'Jassmine',kind:'show'});
  for (const status of ['offAir','defaultPlaylist','schedule']) {
    assert.equal(parseRadioCultShow({success:true,result:{status,metadata:{title:'Song',artist:'Artist'}}}),null);
  }
});

const grid = `Markdown Content:
# schedule
*TIMES ARE DISPLAYED IN [GMT]*
## WED 25.11
14:00-16:00 Yesterday
## THU 26.11
13:00-14:00 Looking For The Perfect Radio
14:00-16:00 [Jassmine](https://www.worldwidefm.net/)
## FRI 27.11
14:00-16:00 Tomorrow
`;
test('Worldwide schedule selects current date and time and never a stale show', () => {
  assert.deepEqual(parseWorldwideSchedule(grid,new Date('2026-11-26T15:10:00Z')),{title:'Jassmine',kind:'scheduled-show'});
  assert.equal(parseWorldwideSchedule(grid,new Date('2026-11-26T16:00:00Z')),null);
  assert.equal(parseWorldwideSchedule(grid,new Date('2026-11-28T15:10:00Z')),null);
  assert.equal(parseWorldwideSchedule('unavailable',new Date('2026-11-26T15:10:00Z')),null);
});
