import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { moveStationBefore, moveStationWithinGroup, normalizeStationOrder, shiftStation, shiftStationWithinGroup, stationOrderStorageKey } from '../app/station-order.mjs';

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

test('seven campus stations remain, Worldwide FM moves to Radios and Campus Paris is absent', () => {
  const stations = readFileSync(new URL('../app/content.ts', import.meta.url), 'utf8');
  const names = ['KCRW Eclectic24', 'KALX 90.7', 'WNUR 89.3', 'WRBB 104.9', 'WFMU',
    'KZSC 88.1', 'WXYC 89.3', 'Worldwide FM'];
  for (const name of names) assert.ok(stations.includes("name: '" + name + "'"), name);
  assert.doesNotMatch(stations,/name: 'Radio Campus Paris'/);
  assert.match(stations,/name: 'Worldwide FM', label: 'Londres/);
  assert.ok(stations.includes('https://streams.kcrw.com/e24_mp3'));
  assert.ok(stations.includes('https://stream0.wfmu.org/freeform-128k'));
  assert.ok(stations.includes('https://worldwide-fm.radiocult.fm/stream'));
});

test('radio UI includes drag handle, keyboard alternatives and local persistence', () => {
  const ui = readFileSync(new URL('../app/journal.tsx', import.meta.url), 'utf8');
  for (const fragment of ['station-drag-handle', 'onDragStart=', 'onDrop=', 'moveStationWithinGroup',
    'shiftStationWithinGroup', 'stationOrderStorageKey', 'Réinitialiser l’ordre', 'visibleStations.map',
    'const dragged = draggingStation.current;']) {
    assert.ok(ui.includes(fragment), fragment);
  }
});

test('moving campus stations cannot reorder existing FIP and Nova stations', () => {
  const order=['FIP','KALX 90.7','Radio Nova','KZSC 88.1','NTS 1','WFMU'];
  const campus=['KALX 90.7','KZSC 88.1','WFMU'];
  assert.deepEqual(moveStationWithinGroup(order,campus,'WFMU','KALX 90.7'),
    ['FIP','WFMU','Radio Nova','KALX 90.7','NTS 1','KZSC 88.1']);
  assert.deepEqual(shiftStationWithinGroup(order,campus,'KALX 90.7',1),
    ['FIP','KZSC 88.1','Radio Nova','KALX 90.7','NTS 1','WFMU']);
  assert.deepEqual(moveStationWithinGroup(order,campus,'FIP','KALX 90.7'),order);
});
