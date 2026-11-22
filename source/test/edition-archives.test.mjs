import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {createHash} from 'node:crypto';
import { test } from 'node:test';

const source = readFileSync(new URL('../app/journal.tsx', import.meta.url), 'utf8');
const styles = readFileSync(new URL('../app/globals.css', import.meta.url), 'utf8');
const manualPublisher = readFileSync(new URL('../scripts/prepare-edition.mjs', import.meta.url), 'utf8');
const autoPublisher = readFileSync(new URL('../scripts/private-cycle.mjs', import.meta.url), 'utf8');
const workflow = readFileSync(new URL('../../.github/workflows/site-deploy.yml', import.meta.url), 'utf8');

test('Archives is a distinct top-level route while listening history stays inside the collection', () => {
  assert.match(source, /\['editions', 'Archives'\]/);
  assert.match(source, /type Page = typeof pages\[number\]\[0\] \| 'archive' \| 'preferences'/);
  assert.match(source, /hash\.startsWith\('editions\/'\)/);
  assert.match(source, /setPage\(editionDate \? 'editions'/);
  assert.match(source, /href="#archive">Voir tout l’historique/);
  assert.match(source, /page === 'archive'/);
  assert.doesNotMatch(source, /\['archive', 'Historique d’écoute'\]/);
});

test('every edition has a dated permalink and home issue date links to it', () => {
  assert.match(source, /browsableEditions = issues\.filter\(edition => edition\.startsOn <= issue\.startsOn\)/);
  assert.match(source, /\.sort\(\(a, b\) => b\.startsOn\.localeCompare\(a\.startsOn\)\)/);
  assert.match(source, /href=\{'#editions\/' \+ edition\.startsOn\}/);
  assert.match(source, /href=\{"#editions\/" \+ issue\.startsOn\}/);
  assert.match(source, /archivedIssue = browsableEditions\.find\(edition => edition\.startsOn === archivedEditionDate\)/);
  assert.match(source, /href="#editions"/);
});

test('the selected historical week shows its own complete editorial snapshot', () => {
  assert.match(source, /cards\(archivedIssue\.albums\)/);
  assert.match(source, /cards\(archivedIssue\.mixes\)/);
  assert.match(source, /cards\(archivedIssue\.playlists, true\)/);
  assert.match(source, /cards\(archivedIssue\.live, true\)/);
  assert.match(source, /archivedIssue\.featured\.title/);
  assert.match(source, /className="edition-list"/);
  assert.match(source, /className="edition-list-item"/);
  assert.match(styles, /\.edition-list-item \{/);
  assert.match(styles, /\.edition-detail-heading \{/);
});

test('both publication paths append editions and changes to published data rebuild Pages', () => {
  assert.match(manualPublisher, /JSON\.stringify\(\[\.\.\.published, draft\], null, 2\)/);
  assert.match(autoPublisher, /JSON\.stringify\(\[\.\.\.editions,draft\],null,2\)/);
  assert.match(workflow, /source\/editorial\/editions\.json/);
});

test('archive edition links omit peripheral counters, and the mix uses the exact uploaded JPEG',()=>{
  assert.doesNotMatch(source,/edition-list-counts/);
  assert.doesNotMatch(source,/edition\.albums\.length\} albums/);
  assert.match(source,/\/art\/mix-semaine\.jpg/);
  const image=readFileSync(new URL('../public/art/mix-semaine.jpg',import.meta.url));
  assert.equal(image.length,227114);
  assert.equal(createHash('sha256').update(image).digest('hex'),'ee02a71b8300e12124e489b42206ac7916875dbc1d22f8bfca0c43bba8f37a13');
});
