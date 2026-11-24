import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { moveStationBefore, normalizeStationOrder, shiftStation, stationOrderStorageKey } from '../app/station-order.mjs';

test('saved station order removes duplicates and obsolete names, appends new radios', () => {
  assert.deepEqual(normalizeStationOrder(['FIP', 'NTS 1', 'KALX 90.7', 'WFMU'],
    ['WFMU', 'FIP', 'WFMU', 'Station ancienne']),
    ['WFMU', 'FIP', 'NTS 1', 'KALX 90.7']);
  assert.deepEqual(normalizeStationOrder(['FIP', 'WFMU'], null), ['FIP', 'WFMU']);
  assert.ok(stationOrderStorageKey.includes('station-order'));
});

test('drag and drop preserves every card and reorders only known items', () => {
  const order = ['FIP', 'NTS 1', 'KALX 90.7', 'WFMU'];
  assert.deepEqual(moveStationBefore(order, 'WFMU', 'NTS 1'),
    ['FIP', 'WFMU', 'NTS 1', 'KALX 90.7']);
  assert.deepEqual(moveStationBefore(order, 'FIP', 'WFMU'),
    ['NTS 1', 'KALX 90.7', 'FIP', 'WFMU']);
  assert.deepEqual(moveStationBefore(order, 'missing', 'FIP'), order);
  assert.deepEqual(order, ['FIP', 'NTS 1', 'KALX 90.7', 'WFMU']);
});

test('accessible up/down controls work without a mouse', () => {
  assert.deepEqual(shiftStation(['FIP', 'WFMU', 'NTS 1'], 'WFMU', 1), ['FIP', 'NTS 1', 'WFMU']);
  assert.deepEqual(shiftStation(['FIP', 'WFMU', 'NTS 1'], 'WFMU', -1), ['WFMU', 'FIP', 'NTS 1']);
  assert.deepEqual(shiftStation(['FIP', 'WFMU'], 'FIP', -1), ['FIP', 'WFMU']);
});

test('all nine approved college and independent radios are represented', () => {
  const stations = readFileSync(new URL('../app/content.ts', import.meta.url), 'utf8');
  const names = ['KCRW Eclectic24', 'KALX 90.7', 'WNUR 89.3', 'WRBB 104.9', 'WFMU',
    'KZSC 88.1', 'WXYC 89.3', 'Worldwide FM', 'Radio Campus Paris'];
  for (const name of names) assert.ok(stations.includes("name: '" + name + "'"), name);
  assert.ok(stations.includes('https://streams.kcrw.com/e24_mp3'));
  assert.ok(stations.includes('https://stream0.wfmu.org/freeform-128k'));
  assert.ok(stations.includes('https://worldwide-fm.radiocult.fm/stream'));
  assert.ok(stations.includes('Only an old HTTP stream was verifiable'));
});

test('radio UI includes drag handle, keyboard alternatives and local persistence', () => {
  const ui = readFileSync(new URL('../app/journal.tsx', import.meta.url), 'utf8');
  for (const fragment of ['station-drag-handle', 'onDragStart=', 'onDrop=', 'moveStationBefore',
    'shiftStation', 'stationOrderStorageKey', 'Réinitialiser l’ordre', 'orderedStations.map']) {
    assert.ok(ui.includes(fragment), fragment);
  }
});
