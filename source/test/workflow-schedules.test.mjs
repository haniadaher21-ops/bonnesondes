import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const workflow = name => readFileSync(new URL('../../.github/workflows/' + name, import.meta.url), 'utf8');

test('daily discovery runs independently, read-only and never publishes', () => {
  const daily = workflow('discover.yml');
  assert.match(daily, /cron: '17 9 \* \* \*'/);
  assert.match(daily, /timezone: Europe\/Paris/);
  assert.match(daily, /vars\.DAILY_COLLECTION_PAUSED != 'true'/);
  assert.match(daily, /contents: read/);
  assert.match(daily, /private-cycle\.mjs collect/);
  assert.match(daily, /AUTO_PUBLISH_ENABLED: 'false'/);
  assert.doesNotMatch(daily, /contents: write|pages: write|private-cycle\.mjs publish/);
});

test('weekly drafts stay scheduled but edition publication is strictly manual', () => {
  const autonomous = workflow('autonomous.yml');
  assert.match(autonomous, /workflow_dispatch:/);
  assert.doesNotMatch(autonomous, /cron:|^  schedule:/m);
  assert.match(autonomous, /if: github\.event_name == 'workflow_dispatch'/);
  const weekly = workflow('weekly.yml');
  assert.match(weekly, /cron: '30 17 \* \* 0'/);
  assert.match(weekly, /AUTO_PUBLISH_ENABLED: 'false'/);
  assert.match(weekly, /contents: read/);
});
