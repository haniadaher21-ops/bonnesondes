import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {test} from 'node:test';

// Check the files GitHub Pages actually serves, not a freshly generated source/out.
test('tracked Pages release matches every file in the reviewed Actions artifact',async()=>{
  const manifest=JSON.parse(await readFile(new URL('../docs/pages-release.json',import.meta.url),'utf8'));
  assert.match(manifest.sourceCommit,/^[a-f0-9]{40}$/);
  assert.equal(manifest.artifactId,14543071734);
  for(const [path,hash] of Object.entries(manifest.files)) {
    assert.ok(!path.startsWith('/') && !path.split('/').includes('..'));
    const bytes=await readFile(new URL('../../'+path,import.meta.url));
    assert.equal(createHash('sha256').update(bytes).digest('hex'),hash,path+' must match the release artifact');
  }
  const html=await readFile(new URL('../../index.html',import.meta.url),'utf8');
  const scripts=[...html.matchAll(/src="(\/bonnesondes\/_next\/[^"?]+)"/g)].map(match=>match[1]);
  assert.ok(scripts.length>0);
  const chunks=await Promise.all(scripts.map(path=>readFile(new URL('../../'+path.slice('/bonnesondes/'.length),import.meta.url),'utf8')));
  assert.ok(chunks.some(chunk=>chunk.includes('Recevoir un lien de connexion') && chunk.includes('code_verifier') && chunk.includes('grant_type=pkce')));
  await readFile(new URL('../../.nojekyll',import.meta.url));
});
