import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import imageBank from '../editorial/image-bank.json' with { type: 'json' };
import { mondayInParis, weeklyHomeImageId } from '../editorial/edition-art.mjs';

test('the illustration flips at Paris Monday midnight in winter, not UTC midnight', () => {
  assert.equal(mondayInParis(new Date('2026-11-29T22:59:59Z')), '2026-11-23');
  assert.equal(mondayInParis(new Date('2026-11-29T23:00:00Z')), '2026-11-30');
  assert.equal(weeklyHomeImageId(new Date('2026-11-29T22:59:59Z')), 'disco-night');
  assert.equal(weeklyHomeImageId(new Date('2026-11-29T23:00:00Z')), 'nice-day');
});

test('the same transition works in Paris summer time', () => {
  assert.equal(mondayInParis(new Date('2027-07-11T21:59:59Z')), '2027-07-05');
  assert.equal(mondayInParis(new Date('2027-07-11T22:00:00Z')), '2027-07-12');
});

test('one photo per week, one new photo each week until all seven have appeared', () => {
  const ids = [];
  for (let week = 0; week < 7; week++) {
    const monday = new Date(Date.parse('2026-11-23T12:00:00Z') + week * 604800000);
    const sunday = new Date(monday.getTime() + 6 * 86400000);
    const mondayImage = weeklyHomeImageId(monday);
    assert.equal(mondayImage, weeklyHomeImageId(sunday));
    ids.push(mondayImage);
  }
  assert.equal(new Set(ids).size, 7);
  assert.equal(ids[0], 'disco-night');
  assert.equal(ids[1], 'nice-day');
  assert.equal(weeklyHomeImageId(new Date('2027-01-11T12:00:00Z')), 'nice-day');
});

test('adding Drive photos midweek does not change that week or its history', () => {
  const original = imageBank.images.map(item => ({ ...item }));
  const updated = [
    ...original,
    { id: 'drive-later', file: '/edition-images/drive-later.jpg', availableFromWeek: '2026-11-30' },
  ];
  for (const time of ['2026-11-23T12:00:00Z','2026-11-27T12:00:00Z','2026-11-29T22:59:59Z']) {
    assert.equal(weeklyHomeImageId(new Date(time), original), weeklyHomeImageId(new Date(time), updated));
  }
  assert.equal(weeklyHomeImageId(new Date('2026-11-30T12:00:00Z'), updated), 'nice-day');
});

test('the homepage uses the calendar week, even if the published edition stays the same', () => {
  const page = readFileSync(new URL('../app/journal.tsx', import.meta.url), 'utf8');
  assert.match(page,/setWeeklyArtId\(weeklyHomeImageId\(new Date\(\)\) \?\? 'disco-night'\)/);
  assert.match(page,/const editionTimer = setInterval\(updateEdition, 1000\)/);
  assert.match(page,/src=\{editionCover\(weeklyArtId\)\.src\}/);
  assert.doesNotMatch(page,/src=\{editionCover\(issue\.coverImageId\)\.src\}/);
  assert.match(page,/editionCover\(archivedIssue\.coverImageId\)\.src/);
});
