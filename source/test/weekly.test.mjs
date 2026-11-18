import assert from 'node:assert/strict';
import { test } from 'node:test';
import { emptyTasteProfile } from '../editorial/taste-profile.mjs';
import { selectEdition } from '../editorial/edition.mjs';
import manualDraft from '../editorial/drafts/002-selection.json' with { type: 'json' };
import { legacyEdition } from '../scripts/editorial-files.mjs';
import { discover } from '../scripts/discovery.mjs';
import { linkedReleaseSources, primaryReleaseDate, verifyAlbums, verifyLives } from '../scripts/weekly-evidence.mjs';
import { nextEditionMonday, weeklyShortlist } from '../scripts/weekly-ranking.mjs';

const albumId = '0Fta5KudJiX6HpDWApUu8y';
const labelUrl = 'https://www.subpop.com/releases/artist/record';
const albumPage = (artist = 'Artist', date = '2026-11-13') => '<script type="application/ld+json">'
  + JSON.stringify({ '@type': 'MusicAlbum', name: 'Record', byArtist: {name: artist}, datePublished: date }) + '</script>';
const playlistId = '64WCJyxoGnhFHdDe6LYwNG';

test('release evidence needs the matching album and artist, and the verified listening link', async () => {
  const record = {title: 'Record', creator: 'Artist', label: 'Sub Pop', sourceUrl: labelUrl};
  assert.equal(primaryReleaseDate(albumPage('Another Artist'), record), undefined);
  assert.equal(primaryReleaseDate(albumPage() + albumPage('Artist', '2026-11-09'), record), undefined);
  assert.equal(primaryReleaseDate('<time datetime="2026-11-18">Review</time>', record), undefined);
  assert.deepEqual(linkedReleaseSources('<a href="' + labelUrl + '?ref=review">Label</a><a href="https://example.test/releases/album">Other</a>'), [labelUrl]);
  const [found, missing] = await verifyAlbums([record, {...record, title: 'Another Record'}], async url =>
    url === labelUrl ? new Response(albumPage() + '<a href="https://open.spotify.com/album/' + albumId + '">Listen</a>') :
      Response.json({title: 'Record', iframe_url: 'https://open.spotify.com/embed/album/' + albumId}));
  assert.equal(found.candidate.releaseDate, '2026-11-13');
  assert.equal(found.candidate.sourceUrl, labelUrl);
  assert.equal(missing.candidate, undefined);
});

test('live verification checks duration, public embed, channel and performance metadata', async () => {
  const ids = ['aaaaaaaaaaa', 'bbbbbbbbbbb', 'ccccccccccc', 'ddddddddddd', 'eeeeeeeeeee'];
  const candidates = ids.map(id => ({id: 'youtube-' + id, format: 'Live session', sourceId: 'channel',
    officialVideo: true, url: 'https://www.youtube.com/watch?v=' + id, embed: {provider: 'youtube', id}}));
  const sources = [{id: 'channel', method: 'youtube-atom', channelId: 'UCverified'}];
  const mock = (url, options) => {
    assert.equal(new URL(url).searchParams.has('key'), false);
    assert.equal(options.headers['x-goog-api-key'], 'test');
    return Response.json({items: ids.map((id, index) => ({
      id, snippet: {channelId: index === 3 ? 'UCother' : 'UCverified', liveBroadcastContent: 'none',
        title: index === 4 ? 'Artist interview' : 'Official performance'},
      status: {privacyStatus: 'public', embeddable: index !== 2},
      contentDetails: {duration: index === 1 ? 'PT40S' : 'PT4M'},
    }))});
  };
  const result = await verifyLives(candidates, sources, 'test', mock);
  assert.deepEqual(result.items.map(item => item.id), ['youtube-aaaaaaaaaaa']);
  assert.equal(result.items[0].minutes, 4);
  assert.equal((await verifyLives(candidates, sources, undefined, mock)).items.length, 0);
});

test('a curator page can surface new playlists while rejecting unrelated links', async () => {
  const url = 'https://curator.test/music';
  const result = await discover({
    sources: [{id: 'curator', name: 'Curator', curator: 'Curator', url, mode: 'automatic', method: 'curator-page'}],
    fetcher: async link => link === url
      ? new Response('<a href="https://open.spotify.com/playlist/' + playlistId + '?si=foo">Music</a><a href="https://open.spotify.com/track/' + playlistId + '">Track</a>')
      : Response.json({title: 'Music', provider_name: 'Spotify', iframe_url: 'https://open.spotify.com/embed/playlist/' + playlistId}),
  });
  assert.equal(result.candidates.length, 1);
  assert.equal(result.candidates[0].playlistOrigin, 'publisher-discovered');
  assert.equal(result.candidates[0].sourceUrl, url);
});

const item = (id, format, options = {}) => ({
  id, title: id, creator: id, format, source: 'Label test',
  sourceUrl: 'https://publisher.test/' + id, url: 'https://publisher.test/content/' + id,
  verificationStatus: 'source-verified', date: '2026-11-17', ...options,
});
const album = (id, options = {}) => item(id, 'Album', { releaseDate: '2026-11-13', verificationStatus: 'primary-verified', ...options });
const radio = (id, provider) => item(id, 'Radio show', {provider});
const readyOptions = {
  sources: [], earlier: [legacyEdition], catalog: [], startsOn: nextEditionMonday(new Date('2026-11-18T19:00:00Z')), now: new Date('2026-11-18T19:00:00Z'),
};
const completeCandidates = [
  album('Alpha'), album('Beta'), album('Gamma', {source: 'Autre label'}),
  album('Old', {releaseDate: '2025-11-13'}), album('Future', {releaseDate: '2026-11-20'}),
  item('Review', 'Album', {verificationStatus: 'release-date-needed'}),
  item('NTS', 'Radio show', {url: 'https://www.nts.live/shows/show/episodes/replay', provider: 'NTS', date: '2025-01-01'}),
  radio('Jazzafip', 'FIP'), radio('Nova Club', 'Radio Nova'),
  item('Playlist', 'Playlist', {url: 'https://open.spotify.com/playlist/' + playlistId, playlistOrigin: 'publisher-discovered'}),
  item('Live', 'Live session', {minutes: 4.5, verificationStatus: 'performance-verified'}),
  item('Unchecked', 'Live session'),
];

test('complete verified inputs give a valid draft and tastes change the radio and album order', () => {
  const fip = weeklyShortlist({ ...readyOptions, candidates: completeCandidates, profile: {
    ...emptyTasteProfile(), favoriteArtists: ['Beta'], favoriteRadios: ['FIP'],
  } });
  const nova = weeklyShortlist({ ...readyOptions, candidates: completeCandidates, profile: {
    ...emptyTasteProfile(), favoriteArtists: ['Alpha'], favoriteRadios: ['Radio Nova'],
  } });
  assert.equal(fip.complete, true);
  assert.equal(nova.complete, true);
  assert.equal(fip.selected.otherRadio[0].item.id, 'Jazzafip');
  assert.equal(nova.selected.otherRadio[0].item.id, 'Nova Club');
  assert.equal(fip.draft.albums[0].id, 'Beta');
  assert.equal(nova.draft.albums[0].id, 'Alpha');
  assert.equal(fip.draft.albums[0].date, '2026-11-13');
  assert.equal(fip.draft.number, manualDraft.number);
  assert.equal(fip.draft.startsOn, manualDraft.startsOn);
  assert.equal(fip.draft.albumWindowStart, '2026-11-09');
  assert.equal(fip.draft.albumWindowStart, manualDraft.albumWindowStart);
  assert.match(fip.draft.mixes[0].reason, /archive/);
  assert.deepEqual(fip.rejected.map(row => row.id), ['Old', 'Future', 'Review', 'Unchecked']);
});

test('feedback, duplicate artists, previously seen links and missing quotas are reported', () => {
  const candidates = [
    ...completeCandidates.filter(row => !['Gamma', 'Live'].includes(row.id)),
    album('Also Alpha', {creator: 'Alpha'}),
  ];
  const result = weeklyShortlist({ ...readyOptions, candidates, seen: {'https://publisher.test/content/Beta': '2026-11-15'}, profile: {
    ...emptyTasteProfile(), signals: {
      items: [{ id: 'Jazzafip', saved: true, reaction: 'Loved' }, { id: 'Nova Club', saved: false, reaction: 'Not for me' }],
      curators: [],
    },
  } });
  assert.deepEqual(result.gaps, {albums: 1, live: 1});
  assert.equal(result.complete, false);
  assert.equal(result.selected.otherRadio[0].item.id, 'Jazzafip');
  assert.match(result.selected.otherRadio[0].reason, /Coup de cœur/);
  assert.ok(result.rankings.find(row => row.item.id === 'Beta').previouslySeen);
});

test('midweek and late Sunday preparation target the same Monday in Paris', () => {
  assert.equal(nextEditionMonday(new Date('2026-11-18T12:00:00Z')), '2026-11-23');
  assert.equal(nextEditionMonday(new Date('2026-11-22T20:00:00Z')), '2026-11-23');
});

test('Monday editions become visible at Paris midnight in winter and summer', () => {
  const previousEdition = { startsOn: '2026-01-05' };
  for (const [startsOn, midnight] of [
    ['2026-11-23', '2026-11-22T23:00:00Z'],
    ['2026-03-30', '2026-03-29T22:00:00Z'],
    ['2026-10-26', '2026-10-25T23:00:00Z'],
  ]) {
    const edition = { startsOn };
    const beforeMidnight = new Date(Date.parse(midnight) - 1);
    assert.equal(nextEditionMonday(beforeMidnight), startsOn);
    assert.equal(selectEdition([previousEdition, edition], beforeMidnight), previousEdition);
    assert.equal(selectEdition([previousEdition, edition], new Date(midnight)), edition);
    assert.notEqual(nextEditionMonday(new Date(midnight)), startsOn);
  }
});

test('the album window includes Monday two weeks before the edition', () => {
  const report = weeklyShortlist({ ...readyOptions, profile: emptyTasteProfile(), candidates: [
    album('Inside', { releaseDate: '2026-11-09' }),
    album('Outside', { releaseDate: '2026-11-08' }),
  ] });
  assert.equal(report.draft.albumWindowStart, '2026-11-09');
  assert.deepEqual(report.draft.albums.map(item => item.id), ['Inside']);
  assert.equal(report.rejected[0].id, 'Outside');
});
