import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ninjaCatalogue, subpopCatalogue, readPublicPage } from '../scripts/album-catalogues.mjs';
import { editionForCycle, publicationDecision, publicEdition, rollCandidates } from '../scripts/automation-policy.mjs';
import { projectOrigin, readRunnerProfile, syncRpc } from '../private-sync/client.mjs';
import { emptyTasteProfile } from '../editorial/taste-profile.mjs';

const row = (type, date, title='Record') => '<tr>'
  + '<td class="artist"><a href="/artist/a">Artist</a></td>'
  + '<td class="title"><a href="/release/artist/record">' + title + '</a></td>'
  + '<td class="type">' + type + '</td><td class="label">Ninja Tune</td>'
  + '<td class="release_date">' + date + '</td></tr>';

test('primary catalogues distinguish albums and reject reissue titles and invalid dates', () => {
  const releases = ninjaCatalogue(row('Album','13/11/2026')+row('Single','14/11/2026')
    +row('Album','31/11/2026')+row('Album','13/11/2026','Record (Anniversary Edition)'));
  assert.equal(releases.length,1);
  assert.equal(releases[0].releaseDate,'2026-11-13');
  assert.equal(subpopCatalogue('<article class="release row"><h3 class="artist-name"><a>Artist</a></h3>'
    +'<h3 class="release-name"><a href="/releases/artist/record">Record</a></h3>'
    +'<span class="release-date">November 13, 2026</span></article>')[0].catalogueDate,'2026-11-13');
});

test('bounded public requests reject HTTP errors and oversized bodies', async () => {
  await assert.rejects(readPublicPage('https://label.test/',async()=>new Response('busy',{status:429})),/HTTP 429/);
  await assert.rejects(readPublicPage('https://label.test/',async()=>new Response('x'.repeat(4_000_001))),/volumineuse/);
});

test('publication is explicitly gated, idempotent and tied to the Paris Sunday cycle across DST', () => {
  for (const [at,monday] of [
    ['2026-03-29T16:00:00Z','2026-03-30'],
    ['2026-10-25T17:00:00Z','2026-10-26'],
    ['2026-11-22T17:00:00Z','2026-11-23'],
    ['2026-11-22T23:01:00Z','2026-11-23'],
  ]) {
    const now=new Date(at);
    assert.equal(editionForCycle(now),monday);
    const observations=[
      {id:'previous-week',at:new Date(+now-7*86400000).toISOString(),complete:true,fingerprint:'valid',trigger:'schedule'},
      {id:'current-week',at:new Date(+now-3600000).toISOString(),complete:true,fingerprint:'valid',trigger:'schedule'},
      {id:'manual-check',at:new Date(+now-7200000).toISOString(),complete:true,fingerprint:'valid',trigger:'manual'},
    ];
    const options={at:now,startsOn:monday,editions:[],complete:true,enabled:'false',observations,fingerprint:'valid'};
    assert.equal(publicationDecision(options).status,'observe');
    assert.equal(publicationDecision({...options,enabled:'true'}).status,'publish');
    const sameWeek = observations.map((run,i)=>({...run,at:new Date(+now-(i+1)*3600000).toISOString()}));
    assert.equal(publicationDecision({...options,enabled:'true',observations:sameWeek}).status,'blocked');
    const manualOnly = observations.map(run=>({...run,trigger:'manual'}));
    assert.equal(publicationDecision({...options,enabled:'true',observations:manualOnly}).status,'blocked');
    assert.equal(publicationDecision({...options,enabled:'true',observations:observations.slice(0,2)}).status,'blocked');
    assert.equal(publicationDecision({...options,enabled:'true',fingerprint:'changed'}).status,'blocked');
    assert.equal(publicationDecision({...options,editions:[{startsOn:monday}]}).status,'noop');
    assert.equal(publicationDecision({...options,enabled:'true',complete:false}).status,'blocked');
  }
  const before={at:new Date('2026-11-22T16:59:59Z'),startsOn:'2026-11-23',editions:[],complete:true,enabled:'true'};
  assert.equal(publicationDecision(before).status,'blocked');
});

test('rolling state retains unselected public metadata, excludes private follows and expires old videos', () => {
  const now=new Date('2026-11-19T12:00:00Z');
  const item={id:'first',format:'Radio show',url:'https://radio.test/episode',sourceUrl:'https://radio.test/feed',collectedAt:'2026-11-18T12:00:00Z'};
  const fresh={...item,collectedAt:now.toISOString()};
  const state=rollCandidates([item],[fresh,{...fresh,id:'private',url:'https://spotify.test/secret',playlistOrigin:'followed'},
    {...fresh,id:'video',url:'https://youtube.com/watch?v=abcdefghijk',format:'Live session',collectedAt:'2026-10-01T00:00:00Z'}],now);
  assert.equal(state.length,1);
  assert.equal(state[0].firstSeenAt,item.collectedAt);
  assert.equal(state[0].collectedAt,now.toISOString());
});

test('private runner access is authenticated and does not depend on the browser session', async () => {
  const profile={...emptyTasteProfile(),favoriteArtists:['Owner preference']};
  const config={url:'https://example.supabase.co',publicKey:'public'};
  const result=await readRunnerProfile(config,'private-runner-token',async(url,options)=>{
    assert.equal(url,'https://example.supabase.co/rest/v1/rpc/bo_runner_read');
    assert.equal(options.headers['x-bo-runner'],'private-runner-token');
    assert.equal(options.headers.Authorization,undefined);
    assert.equal(options.body,'{}');
    return Response.json({profile,revision:2,state:{version:1,candidates:[]}});
  });
  assert.deepEqual(result.profile,profile);
  await assert.rejects(readRunnerProfile(config,'revoked',async()=>Response.json({message:'denied'},{status:401})),/Synchronisation/);
  await assert.rejects(readRunnerProfile(config,'missing',async()=>Response.json({profile:null})),/absent/);
  assert.throws(()=>projectOrigin('https://supabase.co.evil.test/'),/invalide/);
});

test('profile updates send an expected revision and conflicts remain explicit', async () => {
  const config={url:'https://example.supabase.co',publicKey:'public'};
  await assert.rejects(syncRpc(config,'bo_profile_save',{document:emptyTasteProfile(),expected_revision:3},
    {Authorization:'Bearer owner'},async(_,options)=>{
      assert.equal(JSON.parse(options.body).expected_revision,3);
      return Response.json({message:'Revision conflict'},{status:400});
    }),/Conflit/);
});

test('public edition serialization refuses incomplete or unproven data', () => {
  assert.throws(()=>publicEdition({complete:false},[],[]),/incomplet/);
  assert.throws(()=>publicEdition({complete:true,draft:{albums:[{id:'x'}]},selected:{}},[],[]),/publique/);
});

test('ECM uses the explicitly marked original release date rather than the page publication date', async () => {
  const {ecmRelease}=await import('../scripts/album-catalogues.mjs');
  const html='<h1 class="album_tile big">A Record</h1><h2 class="album_artist big">Artist</h2>'
    +'<script type="application/ld+json">{"@type":"WebPage","datePublished":"2026-11-19"}</script>'
    +'<p class="original_release_date">13.11.2026</p>';
  const record=ecmRelease(html,'https://ecmrecords.com/product/a-record/');
  assert.equal(record.releaseDate,'2026-11-13');
});
