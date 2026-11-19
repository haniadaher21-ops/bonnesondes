import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createHash} from 'node:crypto';
import {callbackUrl, consumeMagicLink, pendingKey, sendMagicLink, sessionKey} from '../private-sync/auth.mjs';
const config={url:'https://example.supabase.co',publicKey:'public-test'};
const response={access_token:'access',refresh_token:'refresh',expires_in:3600};
function storage() {
  const values=new Map([['off-frequency.library.v1','favorite-data'],['off-frequency.taste-profile.v1','profile-data']]);
  return {getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)};
}
async function prepare(store) {
  await sendMagicLink(config,'owner@example.test',store,async(url,options)=>{
    assert.equal(new URL(url).searchParams.get('redirect_to'),callbackUrl);
    const body=JSON.parse(options.body);
    assert.equal(body.create_user,false);
    assert.equal(body.code_challenge_method,'s256');
    const pending=JSON.parse(store.getItem(pendingKey));
    assert.equal(body.code_challenge,createHash('sha256').update(pending.verifier).digest('base64url'));
    assert.equal(options.redirect,'error');
    return Response.json({});
  });
}
test('magic link requests S256 PKCE and exact GitHub Pages callback; successful exchange preserves preferences and favorites',async()=>{
  const store=storage(); await prepare(store);
  let cleaned;
  const session=await consumeMagicLink(config,callbackUrl+'?code=auth-code&next=https://evil.test',store,url=>{cleaned=url;},async(url,options)=>{
    assert.equal(cleaned,'/bonnesondes/#preferences');
    assert.equal(store.getItem(pendingKey),null);
    assert.equal(url,'https://example.supabase.co/auth/v1/token?grant_type=pkce');
    assert.equal(JSON.parse(options.body).auth_code,'auth-code');
    return Response.json(response);
  });
  assert.equal(session.access_token,'access');
  assert.equal(JSON.parse(store.getItem(sessionKey)).refresh_token,'refresh');
  assert.equal(store.getItem('off-frequency.library.v1'),'favorite-data');
  assert.equal(store.getItem('off-frequency.taste-profile.v1'),'profile-data');
  assert.equal(store.getItem('off-frequency.sync-consent.v1'),null);
  await assert.rejects(consumeMagicLink(config,callbackUrl+'?code=auth-code',store,()=>{}),/invalide/);
});
test('ordinary navigation does not touch stored data or consume a pending request',async()=>{
  const store=storage(); await prepare(store);
  const pending=store.getItem(pendingKey);
  assert.equal(consumeMagicLink(config,callbackUrl+'#preferences',store,()=>assert.fail()),null);
  assert.equal(store.getItem(pendingKey),pending);
});
test('callbacks reject missing, malformed, future and expired verifiers without contacting Supabase',async()=>{
  for(const pending of [null,'invalid',JSON.stringify({verifier:'a'.repeat(43),issuedAt:0}),JSON.stringify({verifier:'a'.repeat(43),issuedAt:Date.now()+60000})]) {
    const store=storage(); if(pending) store.setItem(pendingKey,pending);
    let cleaned=false;
    await assert.rejects(consumeMagicLink(config,callbackUrl+'?code=test',store,()=>{cleaned=true;},()=>assert.fail()),/invalide/);
    assert.equal(cleaned,true);
  }
});
test('provider errors and legacy implicit tokens are scrubbed and rejected; existing session remains',async()=>{
  for(const query of ['?error=access_denied&error_description=private','#access_token=private&refresh_token=private','?code=a&code=b','?token_hash=private','?code=a#access_token=private']) {
    const store=storage(); await prepare(store);store.setItem(sessionKey,'old-session');
    let clean;
    await assert.rejects(consumeMagicLink(config,callbackUrl+query,store,url=>{clean=url;},()=>assert.fail()),/invalide/);
    assert.equal(clean,'/bonnesondes/#preferences');assert.equal(store.getItem(sessionKey),'old-session');
  }
});
test('failed send and failed or malformed exchanges leave preferences intact and allow a fresh request',async()=>{
  const store=storage();
  await assert.rejects(sendMagicLink(config,'owner@example.test',store,async()=>Response.json({},{status:429})),/Connexion/);
  assert.equal(store.getItem(pendingKey),null);
  for(const value of [null,{...response,expires_in:-1},{...response,access_token:''}]) {
    await prepare(store);
    await assert.rejects(consumeMagicLink(config,callbackUrl+'?code=test',store,()=>{},async()=>Response.json(value)),/invalide/);
    assert.equal(store.getItem(sessionKey),null);
  }
  await prepare(store);
  await assert.rejects(consumeMagicLink(config,callbackUrl+'?code=test',store,()=>{},async()=>Response.json({},{status:400})),/Connexion/);
  assert.equal(store.getItem('off-frequency.library.v1'),'favorite-data');
});
