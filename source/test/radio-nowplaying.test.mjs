import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { parseNovaNowPlaying } from '../app/nova-nowplaying.mjs';

const html=(time,artist='JOY CROOKES &amp; DENZEL CURRY',title='PAINKILLER') =>
  '<html><body><div class="swiper-slide"><div class="wwtt_content">'
  +'<p class="time">'+time+'</p><div class="wwtt_right"><div class="wwtt_imgcontent"></div>'
  +'<h2><a href="https://www.nova.fr/radio-tracks/joy-crookes/">'+artist+'</a></h2>'
  +'<p>'+title+'</p></div></div></div></body></html>';

test('Nova returns a fresh, real station title and artist, with Paris broadcast time',()=>{
  const now=new Date('2026-11-20T09:05:00Z'); // Paris 10:05
  assert.deepEqual(parseNovaNowPlaying(html('10:03'),now),{
    title:'PAINKILLER',artist:'JOY CROOKES & DENZEL CURRY',playedAt:'10:03'
  });
  assert.equal(parseNovaNowPlaying(html('09:59'),now)?.playedAt,'09:59');
  assert.equal(parseNovaNowPlaying(html('09:50'),now)?.playedAt,'09:50');
  assert.equal(parseNovaNowPlaying(html('07:04'),now),null);
  assert.equal(parseNovaNowPlaying(html('10:06'),now),null);
  assert.equal(parseNovaNowPlaying(html('26:02'),now),null);
});

test('the Nova parser fails closed if the page structure or metadata is invalid',()=>{
  const now=new Date('2026-11-20T09:05:00Z');
  assert.equal(parseNovaNowPlaying('<p class="time">10:04</p><p>Advertisement</p>',now),null);
  assert.equal(parseNovaNowPlaying(html('10:04','','Track'),now),null);
  assert.equal(parseNovaNowPlaying('x'.repeat(20001),now),null);
  assert.equal(parseNovaNowPlaying(html('10:04','Station','&lt;Song&gt;'),now)?.title,'<Song>');
});

test('Nova returns only the artwork of the current first slide, never a placeholder',()=>{
  const at=new Date('2026-11-20T09:05:00Z');
  const artwork='https://www.nova.fr/wp-content/thumbnails/uploads/2024/cover.jpeg';
  const image='<img src="data:image/svg+xml,placeholder" data-lazy-src="'+artwork+'" alt="Disque">';
  const updated=html('10:03').replace('<div class="wwtt_imgcontent"></div>',
    '<div class="wwtt_imgcontent">'+image+'</div>');
  assert.equal(parseNovaNowPlaying(updated,at)?.artwork,artwork);
  const placeholder=updated.replace(artwork,'https://www.nova.fr/assets/nova-default.png');
  assert.equal(parseNovaNowPlaying(placeholder,at)?.artwork,undefined);
  const bad=updated.replace(artwork,'javascript:alert(1)');
  assert.equal(parseNovaNowPlaying(bad,at)?.artwork,undefined);
});

test('the first-party Radio France endpoint is used for every themed FIP station',()=>{
  const src=readFileSync(new URL('../app/content.ts',import.meta.url),'utf8');
  assert.match(src,/livemeta\/pull\/' \+ station/);
  for(const id of [64,65,66,74])assert.match(src,new RegExp("fip\\('FIP [^']+', "+id+","));
  for(const slug of ['radio-nova','nova-lanuit','nouvo-nova'])
    assert.ok(src.includes('https://r.jina.ai/https://www.nova.fr/radios/'+slug+'/'));
  const player=readFileSync(new URL('../app/radio-track.tsx',import.meta.url),'utf8');
  assert.match(player,/saveTrack\(trackForSave\)/);
  assert.match(player,/parseNovaNowPlaying/);
});
