import assert from 'node:assert/strict';
import { test } from 'node:test';
import { validateEdition, selectEdition, readPublishedEditions } from '../editorial/edition.mjs';
import { deduplicate, discover, renderReport } from '../scripts/discovery.mjs';
import { legacyEdition, legacyItems } from '../scripts/editorial-files.mjs';
import legacyCatalog from '../editorial/legacy-catalog.json' with { type: 'json' };
import { editionShelf } from '../editorial/shelves.mjs';

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
    live: [
      item('live1', 'Live session', 'https://www.youtube.com/watch?v=abcdefghijk'),
      item('live2', 'Live session', 'https://www.youtube.com/watch?v=123456789ab'),
      item('live3', 'Live session', 'https://www.youtube.com/watch?v=QWERTYuiOP1'),
    ],
  };
}

test('accepts a complete edition and refuses incomplete or unverifiable selections', () => {
  assert.deepEqual(validateEdition(selection(), [legacyEdition]), []);
  const twoLives = selection();
  twoLives.live = twoLives.live.slice(0, 2);
  assert.match(validateEdition(twoLives, [legacyEdition]).join('\n'), /Quota non respecté pour live/);
  const draft = selection();
  draft.albums[0].date = '2026-12-20';
  draft.albums[1].date = '2026-11-31';
  draft.albums[2].id = draft.albums[0].id;
  draft.albums[1].url = 'javascript:alert(1)';
  draft.mixes.shift();
  draft.live[0].embed = { provider: 'youtube', id: 'xL1yyEflGlo' };
  draft.playlists[0].reason = '';
  const errors = validateEdition(draft, [legacyEdition]).join('\n');
  for (const expectation of [/future/, /Date invalide/, /HTTPS/, /Doublon/, /Quota/, /épisode NTS/, /Lecteur invalide/, /raison/]) {
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

const curatorPlaylist = legacyItems.find(item => item.id === 'spotify-7LXauPdOlnW55FQNDWPotY');
const selectedPlaylist = {
  ...curatorPlaylist,
  url: 'https://open.spotify.com/intl-fr/playlist/7LXauPdOlnW55FQNDWPotY?si=shared',
  sourceUrl: curatorPlaylist.url,
  reason: 'Une nouvelle raison éditoriale.',
};

test('reuses stable identities while rejecting URL, ID and format collisions', () => {
  const draft = selection();
  draft.playlists = [selectedPlaylist];
  assert.deepEqual(validateEdition(draft, [legacyEdition], legacyItems), []);
  draft.playlists = [{ ...selectedPlaylist, id: 'another-id' }];
  assert.match(validateEdition(draft, [legacyEdition], legacyItems).join(), /URL déjà associée/);
  draft.playlists = [{ ...selectedPlaylist, url: 'https://open.spotify.com/playlist/0123456789abcdefghijkl', embed: undefined }];
  assert.match(validateEdition(draft, [legacyEdition], legacyItems).join(), /Identifiant déjà associé/);
  draft.playlists = [selectedPlaylist];
  draft.live[0] = { ...draft.live[0], id: selectedPlaylist.id, url: selectedPlaylist.url };
  assert.match(validateEdition(draft, [legacyEdition], legacyItems).join(), /Identifiant déjà associé/);
  draft.live = [selection().live[0], { ...selection().live[0], id: 'second-live' }, selection().live[2]];
  assert.match(validateEdition(draft, [legacyEdition], legacyItems).join(), /Doublon/);
});

test('reads two successive editions with the same playlist and keeps their editorial notes', () => {
  const first = { ...selection(), playlists: [selectedPlaylist] };
  const secondPlaylist = { ...selectedPlaylist, reason: 'Une raison différente la semaine suivante.' };
  const second = {
    ...first, number: '003', startsOn: '2026-11-30', playlists: [secondPlaylist],
  };
  const accepted = readPublishedEditions([first, second], legacyEdition, legacyItems);
  assert.deepEqual(accepted, [first, second]);
  assert.equal(selectEdition(accepted, new Date('2026-11-29T22:59:59Z')).playlists[0].reason, selectedPlaylist.reason);
  assert.equal(selectEdition(accepted, new Date('2026-11-29T23:00:00Z')).playlists[0].reason, secondPlaylist.reason);
  assert.equal(selectEdition(accepted, new Date('2026-11-29T23:00:00Z')).playlists[0].id, curatorPlaylist.id);

  const collision = { ...second, mixes: [{ ...second.mixes[0], id: 'different-nts-id' }, second.mixes[1]], featuredId: 'different-nts-id' };
  assert.deepEqual(readPublishedEditions([first, collision], legacyEdition, legacyItems), [first]);
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
    cpSync(new URL('../package.json', import.meta.url), join(copy, 'package.json'));
    const run = (...args) => spawnSync('npm', ['run', 'edition', '--', 'selection.json', ...args], {
      cwd: copy, encoding: 'utf8',
    });
    const draft = selection();
    draft.playlists = [selectedPlaylist];
    writeFileSync(published, '[]\n');
    writeFileSync(input, JSON.stringify({ ...draft, albums: [] }));
    assert.equal(run('--approve').status, 1);
    assert.equal(readFileSync(published, 'utf8'), '[]\n');
    writeFileSync(input, JSON.stringify(draft));
    const checked = run();
    assert.equal(checked.status, 0, checked.stderr);
    assert.match(checked.stdout, /Édition 002 valide/);
    assert.equal(readFileSync(published, 'utf8'), '[]\n');
    assert.equal(run('--approve').status, 0);
    assert.deepEqual(JSON.parse(readFileSync(published, 'utf8')), [draft]);
    assert.equal(run('--approve').status, 1);
    assert.deepEqual(JSON.parse(readFileSync(published, 'utf8')), [draft]);
  } finally {
    rmSync(copy, { recursive: true, force: true });
  }
});

test('validated edition 002 leads the dedicated shelves alongside older and personal picks', () => {
  const { playlists: historicalPlaylists, live: historicalLive } = legacyCatalog;
  const first = { ...legacyEdition, playlists: historicalPlaylists.slice(0, 2), live: historicalLive.slice(0, 2) };
  const draft = selection();
  draft.playlists = [{
    ...draft.playlists[0], id: 'spotify-64WCJyxoGnhFHdDe6LYwNG', title: 'Mr Bongo Weekly Selections',
    url: 'https://open.spotify.com/playlist/64WCJyxoGnhFHdDe6LYwNG',
    sourceUrl: 'https://www.mrbongo.com/index', embed: { provider: 'spotify', id: '64WCJyxoGnhFHdDe6LYwNG' },
  }];
  draft.live = [
    ['Ji7g_Bks7Xc', 'WILLOW in the Radio 1 Live Lounge'],
    ['R03Hzewk_yk', 'Somebody That I Used to Know (reprise de Gotye)'],
    ['sWJbOWJMJQ0', 'Rachel Chinouriri dans le Live Lounge'],
  ].map(([id, title]) => {
    const url = 'https://www.youtube.com/watch?v=' + id;
    return {
      ...draft.live[0], id: 'youtube-' + id, title, url, sourceUrl: url,
      officialVideo: true, videoSourceUrl: url, embed: { provider: 'youtube', id },
    };
  });

  const [published] = readPublishedEditions([draft], legacyEdition, legacyItems);
  assert.ok(published);
  const editions = [first, published];
  const active = selectEdition(editions, new Date('2026-11-22T23:00:00Z'));
  assert.equal(active, published);

  const personal = { id: 'spotify-AAAAAAAAAAAAAAAAAAAAAA', url: 'https://open.spotify.com/playlist/AAAAAAAAAAAAAAAAAAAAAA', creator: 'Ma sélection' };
  const saved = { [personal.id]: { saved: true }, [historicalPlaylists[0].id]: { saved: true } };
  const playlists = editionShelf(editions, active, 'playlists', [...historicalPlaylists, personal]);
  const live = editionShelf(editions, active, 'live', historicalLive);
  assert.deepEqual(playlists.map(item => item.id), [draft.playlists[0].id, ...historicalPlaylists.map(item => item.id), personal.id]);
  assert.deepEqual(live.map(item => item.id), [...draft.live, ...historicalLive].map(item => item.id));
  assert.deepEqual(playlists[0].embed, draft.playlists[0].embed);
  assert.deepEqual(live.slice(0, 3).map(item => item.embed), draft.live.map(item => item.embed));
  assert.deepEqual(playlists.filter(item => saved[item.id]?.saved), [historicalPlaylists[0], personal]);
  assert.ok(!editionShelf(editions, first, 'playlists', historicalPlaylists).some(item => item.id === draft.playlists[0].id));
});

test('a returning recommendation keeps its stable ID and fills in missing metadata only for the same URL', () => {
  const older = { id: 'spotify-64WCJyxoGnhFHdDe6LYwNG', url: 'https://open.spotify.com/playlist/64WCJyxoGnhFHdDe6LYwNG', genre: 'Soul' };
  const active = {
    startsOn: '2026-11-30',
    playlists: [{ id: older.id, url: 'https://open.spotify.com/intl-fr/playlist/64WCJyxoGnhFHdDe6LYwNG?si=shared', reason: 'Le choix de la semaine' }],
    live: [],
  };
  const early = { startsOn: '2026-11-23', playlists: [older], live: [] };
  const unrelated = { id: older.id, url: 'https://open.spotify.com/playlist/AAAAAAAAAAAAAAAAAAAAAA', mood: 'Calme' };
  assert.deepEqual(editionShelf([early, active], active, 'playlists', [unrelated]), [
    { ...active.playlists[0], genre: older.genre },
  ]);
});
