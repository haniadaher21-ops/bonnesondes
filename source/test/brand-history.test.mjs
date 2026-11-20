import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../app/journal.tsx', import.meta.url), 'utf8');
const styles = readFileSync(new URL('../app/globals.css', import.meta.url), 'utf8');
const metadata = readFileSync(new URL('../app/layout.tsx', import.meta.url), 'utf8');
const icon = readFileSync(new URL('../app/icon.svg', import.meta.url), 'utf8');
const mark = readFileSync(new URL('../public/bonnes-ondes-mark.svg', import.meta.url), 'utf8');

test('the new cream, dark and rust symbol is used as both site logo and browser tab icon', () => {
  assert.equal(icon, mark);
  for (const color of ['#efe6d3', '#171512', '#efcfa8', '#ad211f']) {
    assert.ok(icon.includes(color));
  }
  assert.ok(icon.includes('viewBox="0 0 128 128"'));
  assert.match(metadata, /\/bonnesondes\/icon\.svg/);
  assert.match(source, /bonnes-ondes-mark\.svg/g);
  assert.doesNotMatch(source, /className="brand-disc"/);
  assert.doesNotMatch(source, /<Disc3 size=\{19\}/);
});

test('there are no red round signal dots on any page heading or featured label', () => {
  assert.doesNotMatch(source, /signal-dot/);
  assert.doesNotMatch(styles, /\.signal-dot/);
  assert.match(source, /<p className="eyebrow">\{label\}<\/p>/);
  assert.match(source, /<p className="eyebrow">Mix de la semaine<\/p>/);
});

test('library has a compact left section and separately scrollable listening history on the right', () => {
  assert.match(source, /className="collection-layout"/);
  assert.match(source, /className="collection-content"/);
  assert.match(source, /className="history-panel"/);
  assert.match(source, /listenedItems\.map\(/);
  assert.match(styles, /\.history-list \{ max-height: min\(640px, 65vh\); overflow-y: auto/);
  assert.match(styles, /\.collection-layout \{ display: grid; grid-template-columns: minmax\(0, 1fr\) 294px/);
  assert.match(styles, /@media \(max-width: 780px\)[\s\S]*?\.collection-layout \{ grid-template-columns: minmax\(0, 1fr\); \}/);
});

test('the complete history stays at the former archives route, and archival discoveries are preserved', () => {
  assert.match(source, /\['archive', 'Historique d’écoute'\]/);
  assert.match(source, /href="#archive">Voir tout l’historique/);
  assert.match(source, /title="Historique d’écoute"/);
  assert.match(source, /Les archives de Bonnes Ondes/);
  assert.match(source, /\{cards\(archive, false, true\)\}/);
  assert.match(source, /cards\(libraryResults, false, true\)/);
  assert.match(styles, /\.card-grid-compact \{ grid-template-columns: repeat\(4/);
});

test('personal history contains only deliberately marked listened items, with newest first', () => {
  assert.match(source, /all\.filter\(item => library\.entries\[item\.id\]\?\.listened\)/);
  assert.match(source, /Date\.parse\(library\.entries\[b\.id\]\?\.listenedAt/);
  assert.match(source, /listenedAt: checked \? new Date\(\)\.toISOString\(\) : undefined/);
  assert.match(source, /Ces sélections plus anciennes ne sont pas automatiquement comptées comme écoutées/);
});
