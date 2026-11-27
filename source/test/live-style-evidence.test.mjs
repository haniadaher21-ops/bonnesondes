import assert from 'node:assert/strict';
import {test} from 'node:test';
import {officialLiveGenres} from '../scripts/live-style-evidence.mjs';
test('official descriptions explicitly describing the performer supply genres',()=>{
 const found=officialLiveGenres('Example Band blends indie-pop and neo soul in this live session. Subscribe for more techno.','Example Band');
 assert.ok(found.includes('indie pop'));assert.ok(found.includes('neo soul'));assert.ok(!found.includes('techno'));
});
test('unrelated artists, comparisons, negations, links and channels are not genre evidence',()=>{
 for(const s of ['Other Artist plays techno. Example Band joins us.','Example Band is not a jazz band.','Example Band sounds like a rock band.','Example Band plays a cover of a pop song originally by Other.','Subscribe: Example Band plays soul.','Example Band plays pop https://example.com','Example Bandits play rock.']){
  assert.deepEqual(officialLiveGenres(s,'Example Band'),[],s);
 }
 assert.deepEqual(officialLiveGenres('KEXP brings you rock performances.','Example Band'),[]);
});
