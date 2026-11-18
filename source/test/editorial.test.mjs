import assert from 'node:assert/strict';
import { test } from 'node:test';
import { validateEdition, selectEdition } from '../editorial/edition.mjs';
import { deduplicate, discover, renderReport } from '../scripts/discovery.mjs';
import { legacyEdition } from '../scripts/editorial-files.mjs';

function selection() {
  const item = (id, format, url) => ({ id, format, title: id, source: 'Source de test', url, sourceUrl: url, reason: 'Motif éditorial de test.' });
  const nts = item('nts', 'Radio show', 'https://www.nts.live/shows/show/episodes/episode');
  return {
    number: '002', startsOn: '2026-11-23', label: 'Semaine du 23 novembre', albumWindowStart: '2026-11-16',
    featuredId: 'nts',
    albums: [1, 2, 3].map(id => ({
      ...item('album' + id, 'Album', 'https://artist.example/album/' + id), date: '2026-11-20',
    })),
    mixes: [nts, item('nova', 'Radio show', 'https://www.nova.fr/podcasts/episode')],
    playlists: [item('playlist', 'Playlist', 'https://open.spotify.com/playlist/7LXauPdOlnW55FQNDWPotY')],
    live: [item('live', 'Live session', 'https://www.youtube.com/watch?v=xL1yyEflGlo')],
  };
}

test('accepts a complete edition and refuses incomplete or unverifiable selections', () => {
  assert.deepEqual(validateEdition(selection(), [legacyEdition]), []);
  const draft = selection();
  draft.albums[0].date = '2026-10-20';
  draft.albums[1].date = '2026-11-31';
  draft.albums[2].id = draft.albums[0].id;
  draft.albums[1].url = 'javascript:alert(1)';
  draft.mixes.shift();
  draft.live[0].embed = { provider: 'youtube', id: 'xL1yyEflGlo' };
  draft.playlists[0].reason = '';
  const errors = validateEdition(draft, [legacyEdition]).join('\n');
  for (const expectation of [/hors fenêtre/, /Date invalide/, /HTTPS/, /Doublon/, /Quota/, /épisode NTS/, /Lecteur invalide/, /raison/]) {
    assert.match(errors, expectation);
  }
});

test('changes editions at midnight in Paris in winter and summer', () => {
  for (const [startsOn, midnight] of [['2026-11-23', '2026-11-22T23:00:00Z'], ['2027-07-12', '2027-07-11T22:00:00Z']]) {
    const next = { number: '002', startsOn };
    const editions = [next, legacyEdition];
    assert.equal(selectEdition(editions, new Date(Date.parse(midnight) - 1)), legacyEdition);
    assert.equal(selectEdition(editions, new Date(midnight)), next);
  }
});

test('deduplicates across providers and previously published IDs or links', () => {
  const a = { id: 'video', url: 'https://youtu.be/xL1yyEflGlo?si=tracked' };
  const b = { id: 'other', url: 'https://www.youtube.com/watch?v=xL1yyEflGlo&utm_source=site' };
  const c = { id: 'video', url: 'https://example.test/elsewhere' };
  const d = { id: 'playlist', url: 'https://open.spotify.com/intl-fr/playlist/7LXauPdOlnW55FQNDWPotY?si=123' };
  const existing = [{ id: 'known', url: 'https://open.spotify.com/playlist/7LXauPdOlnW55FQNDWPotY' }];
  assert.deepEqual(deduplicate([a, b, c, d], existing), { candidates: [a], duplicates: [b, c, d] });
});

test('retains valid candidates when another source fails and reports provenance', async () => {
  const nts = { name: 'NTS', mode: 'automatic', method: 'nts-episodes', feed: 'https://www.nts.live/test-feed' };
  const youtube = { name: 'COLORS', mode: 'automatic', method: 'youtube-atom', channelId: 'test-channel' };
  const now = new Date('2026-11-20T12:00:00Z');
  const result = await discover({
    sources: [nts, youtube], now,
    fetcher: async url => {
      if (url === nts.feed) return Response.json({ results: [{
        status: 'published', name: 'Test de collecte', show_alias: 'show', episode_alias: 'episode',
        broadcast: '2026-11-19T12:00:00Z',
      }] });
      if (url === 'https://www.nts.live/shows/show/episodes/episode') return new Response('Épisode');
      return new Response(null, { status: 503 });
    },
  });
  assert.equal(result.candidates.length, 1);
  assert.equal(result.candidates[0].sourceUrl, nts.feed);
  assert.equal(result.candidates[0].collectedAt, now.toISOString());
  assert.equal(result.candidates[0].dateKind, 'broadcast');
  assert.match(renderReport(result), /Indisponibilité.*HTTP 503/);
});

test('collects an official YouTube Atom entry and validates its video URL', async () => {
  const channelId = 'UCfixture';
  const source = { name: 'Live Lounge', mode: 'automatic', method: 'youtube-atom', channelId, titleContains: 'live lounge' };
  const xml = `<feed xmlns:yt="http://www.youtube.com/xml/schemas/2015">
    <yt:channelId>${channelId.slice(2)}</yt:channelId>
    <entry><yt:channelId>${channelId}</yt:channelId><yt:videoId>xL1yyEflGlo</yt:videoId>
    <title>Live Lounge &amp; reprise</title><published>2026-11-20T12:00:00Z</published></entry>
    <entry><title>Interview</title></entry>
  </feed>`;
  const result = await discover({
    sources: [source], fetcher: async url => url.includes('oembed')
      ? Response.json({ title: 'Live Lounge & reprise' }) : new Response(xml),
  });
  assert.equal(result.candidates.length, 1);
  assert.equal(result.candidates[0].title, 'Live Lounge & reprise');
  assert.equal(result.candidates[0].publishedAt, '2026-11-20T12:00:00Z');
});

test('keeps published data intact when CLI approval fails or is omitted', async () => {
  const { mkdtempSync, cpSync, readFileSync, writeFileSync, rmSync } = await import('node:fs');
  const { spawnSync } = await import('node:child_process');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const copy = mkdtempSync(join(tmpdir(), 'bonnes-ondes-edition-'));
  try {
    for (const folder of ['scripts', 'editorial']) {
      cpSync(new URL('../' + folder, import.meta.url), join(copy, folder), { recursive: true });
    }
    const published = join(copy, 'editorial', 'editions.json');
    const input = join(copy, 'selection.json');
    const run = (...args) => spawnSync(process.execPath, [join(copy, 'scripts/prepare-edition.mjs'), input, ...args]);
    const draft = selection();
    // Use distinct IDs and URLs instead of the historical fixtures' links.
    draft.playlists[0].url = 'https://open.spotify.com/playlist/0123456789abcdefghijkl';
    draft.live[0].url = 'https://www.youtube.com/watch?v=abcdefghijk';
    writeFileSync(published, '[]\n');
    writeFileSync(input, JSON.stringify({ ...draft, albums: [] }));
    assert.equal(run('--approve').status, 1);
    assert.equal(readFileSync(published, 'utf8'), '[]\n');
    writeFileSync(input, JSON.stringify(draft));
    assert.equal(run().status, 0);
    assert.equal(readFileSync(published, 'utf8'), '[]\n');
    assert.equal(run('--approve').status, 0);
    assert.deepEqual(JSON.parse(readFileSync(published, 'utf8')), [draft]);
    assert.equal(run('--approve').status, 1);
    assert.deepEqual(JSON.parse(readFileSync(published, 'utf8')), [draft]);
  } finally {
    rmSync(copy, { recursive: true, force: true });
  }
});
