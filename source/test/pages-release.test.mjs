import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

// The original 2026-11-19 release archive is a historical audit snapshot.
// After automated Pages deployments the public HTML legitimately changes.
// Test the actually deployed bundle instead of comparing it against hashes
// pinned to an obsolete historical build.
test('current Pages entrypoints serve a complete PKCE-enabled Next bundle', async () => {
  const manifest=JSON.parse(await readFile(new URL('../docs/pages-release.json',import.meta.url),'utf8'));
  assert.match(manifest.sourceCommit,/^[a-f0-9]{40}$/);
  assert.ok(Number.isInteger(manifest.artifactId));
  assert.ok(Object.keys(manifest.files).length>=10);

  const html=await readFile(new URL('../../index.html',import.meta.url),'utf8');
  assert.match(html,/<html[^>]*lang="fr"/);
  assert.match(html,/Bonnes Ondes/);
  const scripts=[...new Set([...html.matchAll(/src="(\/bonnesondes\/_next\/[^"?]+\.js)"/g)].map(match=>match[1]))];
  assert.ok(scripts.length>0,'Public Next scripts are required');
  const chunks=await Promise.all(scripts.map(path=>
    readFile(new URL('../../'+path.slice('/bonnesondes/'.length),import.meta.url),'utf8')));
  assert.ok(chunks.some(chunk=>chunk.includes('Recevoir un lien de connexion') && chunk.includes('code_verifier') && chunk.includes('grant_type=pkce')),
    'The deployed bundle must keep the verified PKCE login');
  await readFile(new URL('../../404.html',import.meta.url));
  await readFile(new URL('../../.nojekyll',import.meta.url));
});
