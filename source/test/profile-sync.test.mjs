import assert from 'node:assert/strict';
import { test } from 'node:test';
import { projectOrigin, syncRpc } from '../private-sync/client.mjs';

test('private sync accepts only a Supabase HTTPS project origin', () => {
  assert.equal(projectOrigin('https://nzgmncknivttoskakbvp.supabase.co/rest/v1/'),'https://nzgmncknivttoskakbvp.supabase.co');
  for (const url of ['http://project.supabase.co','https://user:pass@project.supabase.co','https://supabase.co.evil.test']) {
    assert.throws(()=>projectOrigin(url),/invalide/);
  }
});

test('profile sync uses the authenticated owner and expected revision, preserving conflicts', async () => {
  const config={url:'https://example.supabase.co',publicKey:'public-test'};
  await assert.rejects(syncRpc(config,'bo_profile_save',{document:{version:1},expected_revision:2},
    {Authorization:'Bearer test-session'},async(url,options)=>{
      assert.equal(url,'https://example.supabase.co/rest/v1/rpc/bo_profile_save');
      assert.equal(options.headers.Authorization,'Bearer test-session');
      assert.equal(JSON.parse(options.body).expected_revision,2);
      return Response.json({message:'Revision conflict'},{status:400});
    }),/Conflit/);
});
