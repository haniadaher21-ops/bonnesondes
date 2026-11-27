import assert from 'node:assert/strict';
import {enrichPublicArtists} from './public-artist-metadata.mjs';

// Deliberately fixed public reference artists, unrelated to any imported profile.
const data=await enrichPublicArtists(['Björk','Radiohead'],{limit:2});
const summary=[...data.values()].map(x=>({status:x.status,neighbors:x.neighbors?.length??0}));
console.log('Public metadata smoke test:',JSON.stringify(summary));
assert.ok(summary.some(x=>x.status==='verified'&&x.neighbors>0),'No public artist neighbors verified');
