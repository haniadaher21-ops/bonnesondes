import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import sources from '../editorial/sources.json' with { type: 'json' };

const ui = readFileSync(new URL('../app/journal.tsx', import.meta.url), 'utf8');
const stations = readFileSync(new URL('../app/content.ts', import.meta.url), 'utf8');
const main = stations.split('export const stations: Station[] = [')[1]?.split('\n];')[0] ?? '';

test('the homepage offers heart and thumbs-down as mutually exclusive reactions', () => {
  assert.match(ui, /Heart size=\{18\}/);
  assert.match(ui, /ThumbsDown size=\{18\}/);
  assert.match(ui, /entry\.reaction === reaction \? undefined : reaction/);
  assert.match(ui, /aria-pressed=\{reaction === 'Loved'\}/);
  assert.match(ui, /aria-pressed=\{reaction === 'Not for me'\}/);
  assert.match(ui, /\{reactionButtons\(item\)\}/);
  assert.match(ui, /title="Performances à découvrir"/);
  assert.match(ui, /cards\(issue\.live\.slice\(0, 3\), true\)/);
  assert.doesNotMatch(ui, /<span className="signal-dot" \/> Journal musical/);
});

test('the first radio row is FIP, NTS 1 and La Belle Aventure', () => {
  const order = [...main.matchAll(/name: '([^']+)'/g)].map(match => match[1]);
  assert.deepEqual(order.slice(0,3), ['FIP','NTS 1','Radio La Belle Aventure']);
  for (const stream of ['novazz','nova-ln','nova-nouvo']) {
    assert.match(main, new RegExp('https://'+stream+'\\.ice\\.infomaniak\\.ch/'));
  }
});

test('Radio Nova and Nouvo Nova take the former FIP Jazz and FIP Electro positions', () => {
  const order=[...main.matchAll(/\bname: '([^']+)'|fip\('([^']+)'/g)].map(m=>m[1]||m[2]);
  assert.deepEqual(order,[
    'FIP','NTS 1','Radio La Belle Aventure',
    'Radio Nova','FIP Groove','Nouvo Nova',
    'FIP Rock','FIP Jazz','Nova la nuit',
    'FIP Electro','NTS 2',
  ]);
});

test('live discovery has verified official sources beyond the initial three', () => {
  for (const [id,channelId] of [
    ['kexp-live','UC3I2GFN_F8WudD_2jUZbojA'],
    ['npr-tiny-desk','UC4eYXhJI4-7wSWc8UNRwD4A']
  ]) {
    const source=sources.find(s=>s.id===id);
    assert.ok(source);
    assert.equal(source.method,'youtube-atom');
    assert.equal(source.channelId,channelId);
    assert.equal(source.format,'Live session');
  }
});

test('album covers and titles open Spotify, while curator citations remain secondary',()=>{
  assert.match(ui,/item\.format === 'Album' && item\.url\.startsWith\('https:\/\/open\.spotify\.com\/album\/'\)/);
  assert.match(ui,/className="album-cover-link"/);
  assert.match(ui,/Écouter sur Spotify/);
  assert.match(ui,/Lire la recommandation/);
  assert.match(ui,/selected\.editorialUrl/);
  assert.doesNotMatch(ui,/\(selected\.format === 'Album' \|\| !selected\.embed \? 'Écouter sur '\)/);
});


test('YouTube videos launch a single persistent floating iframe, not a new inline player per tab',()=>{
  assert.match(ui,/const \[activeVideo, setActiveVideo\] = useState<Recommendation \| null>\(null\)/);
  assert.match(ui,/setActiveVideo\(current => current\?\.embed\?\.provider === 'youtube'/);
  assert.match(ui,/className="video-launch" onClick=\{\(\) => startVideo\(item\)\}/);
  assert.match(ui,/className="video-dock-iframe"/);
  assert.match(ui,/referrerPolicy="strict-origin-when-cross-origin"/);
  assert.match(ui,/loading="eager"/);
  assert.match(ui,/allow="autoplay; encrypted-media; gyroscope; picture-in-picture; fullscreen; web-share"/);
  assert.match(ui,/key=\{videoId\}/);
  assert.match(ui,/onClose=\{\(\) => \{ setActiveVideo\(null\)/);
  assert.match(ui,/setRadioOpen\(false\)/);
  assert.match(ui,/setActiveVideo\(null\);\s*setStation\(next\)/);
  assert.doesNotMatch(ui,/www\.youtube-nocookie\.com\/embed/);
  assert.ok(ui.indexOf('<PersistentYouTubePlayer item={activeVideo}')>ui.indexOf('</main>'),
    'The persistent YouTube iframe must live after main, outside conditional pages');
  const readHash=ui.slice(ui.indexOf('const readHash = () => {'),ui.indexOf("window.addEventListener('hashchange'"));
  assert.doesNotMatch(readHash,/setActiveVideo|setVideoExpanded/,'Hash navigation cannot reset playback');
});

test('mini-player controls remain accessible even while the user browses other sections',()=>{
  assert.match(ui,/Réduire le lecteur YouTube/);
  assert.match(ui,/Agrandir le lecteur YouTube/);
  assert.match(ui,/Arrêter la vidéo et fermer le lecteur YouTube/);
  assert.match(ui,/onClick=\{\(\) => startVideo\(selected\)\}/);
  assert.match(ui,/radio-dock-with-video/);
});
