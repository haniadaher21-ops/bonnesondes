import assert from 'node:assert/strict';
import { test } from 'node:test';
import { emptyTasteProfile } from '../editorial/taste-profile.mjs';
import { selectEdition } from '../editorial/edition.mjs';
import manualDraft from '../editorial/drafts/002-selection.json' with { type: 'json' };
import { legacyEdition } from '../scripts/editorial-files.mjs';
import { discover } from '../scripts/discovery.mjs';
import { linkedReleaseSources, primaryReleaseDate, verifyAlbums, verifyLives } from '../scripts/weekly-evidence.mjs';
import { nextEditionMonday, weeklyShortlist } from '../scripts/weekly-ranking.mjs';
import { livePerformer, excludesJazz, editorialEndorsement, isFreshMusicMix } from '../scripts/recommendation-policy.mjs';

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
      Response.json({title: 'Record', provider_name:'Spotify', thumbnail_url:'https://i.scdn.co/image/fixture-album-art', iframe_url: 'https://open.spotify.com/embed/album/' + albumId}));
  assert.equal(found.candidate.releaseDate, '2026-11-13');
  assert.equal(found.candidate.sourceUrl, labelUrl);
  assert.equal(found.candidate.url,'https://open.spotify.com/album/'+albumId);
  assert.equal(found.candidate.artwork,'https://i.scdn.co/image/fixture-album-art');
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
        title: index === 4 ? 'Artist interview' : 'Official performance',
        tags: index === 0 ? ['indie rock','official live'] : []},
      status: {privacyStatus: 'public', embeddable: index !== 2},
      contentDetails: {duration: index === 1 ? 'PT40S' : 'PT4M'},
    }))});
  };
  const result = await verifyLives(candidates, sources, 'test', mock);
  assert.deepEqual(result.items.map(item => item.id), ['youtube-aaaaaaaaaaa']);
  assert.equal(result.items[0].minutes, 4);
  assert.ok(result.items[0].tags.includes('indie rock'));
  assert.ok(result.items[0].tags.includes('rock'));
  assert.equal(excludesJazz({...result.items[0],tags:['jazz']}),true);
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
const album = (id, options = {}) => item(id, 'Album', { releaseDate: '2026-11-13',
  verificationStatus: 'primary-verified', editorialSource:'Bandcamp Daily',
  editorialUrl:'https://daily.bandcamp.com/album-of-the-day/fixture-'+id.toLowerCase().replace(/[^a-z0-9]+/g,'-'),
  editorialKind:'curator-pick',editorialClaim:'Album of the Day',...options });
const radio = (id, provider) => item(id, 'Radio show', {
 provider,mixKind:'dj-set',
 ...(provider==='Radio Nova' ? {
  sourceId:'nova-danse',source:'Radio Nova · Nova Danse',
  url:'https://podcasts.nova.fr/radio-nova-nova-danse/20261120-'+id.toLowerCase().replace(/[^a-z0-9]+/g,'-'),
  date:'2026-11-17',
 } : {sourceId:'dj-'+id}),
});
const youtubeMix=(id='YouTube mix',options={})=>item(id,'Radio show',{
 title:'All-vinyl DJ set | DJ Good Selector',creator:'DJ Good Selector',source:'YouTube · DJ Good Selector',
 sourceId:'youtube-mix-UC'+'A'.repeat(22),mixKind:'curated-mix',audienceVerified:true,viewCount:150000,subscriberCount:80000,mixStyle:'soul',mixStyleVerified:true,
 url:'https://www.youtube.com/watch?v=3C01eaL5_Xw',sourceUrl:'https://www.youtube.com/channel/UC'+'A'.repeat(22),
 videoSourceUrl:'https://www.youtube.com/watch?v=3C01eaL5_Xw',
 officialVideo:true,embed:{provider:'youtube',id:'3C01eaL5_Xw'},
 date:'2026-11-17',minutes:58,verificationStatus:'source-verified',...options,
});
const readyOptions = {
  sources: [], earlier: [legacyEdition], catalog: [], startsOn: nextEditionMonday(new Date('2026-11-18T19:00:00Z')), now: new Date('2026-11-18T19:00:00Z'),
};
const completeCandidates = [
  album('Alpha'), album('Beta'), album('Gamma', {source: 'Autre label'}),
  album('Old', {releaseDate: '2025-11-13'}), album('Future', {releaseDate: '2026-11-20'}),
  item('Review', 'Album', {verificationStatus: 'release-date-needed'}),
  item('NTS', 'Radio show', {url: 'https://www.nts.live/shows/show/episodes/replay', provider: 'NTS',mixKind:'dj-set',sourceId:'nts-test',date: '2026-11-17'}),
  radio('Jazzafip', 'FIP'), radio('Nova Danse', 'Radio Nova'),youtubeMix(),
  item('Playlist', 'Playlist', {url: 'https://open.spotify.com/playlist/' + playlistId, playlistOrigin: 'publisher-discovered'}),
  item('Live', 'Live session', {minutes: 4.5, sourceId:'npr',verificationStatus: 'performance-verified'}),
  item('Live2', 'Live session', {minutes: 18, sourceId:'colors',verificationStatus: 'performance-verified'}),
  item('Live3', 'Live session', {minutes: 22, sourceId:'kexp',verificationStatus: 'performance-verified'}),
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
  assert.equal(fip.selected.live.length, 3);
  assert.equal(nova.draft.live.length, 3);
  assert.equal(fip.selected.nova[0].item.id, 'Nova Danse');
  assert.equal(nova.selected.nova[0].item.id, 'Nova Danse');
  assert.equal(fip.draft.albums[0].id, 'Beta');
  assert.equal(nova.draft.albums[0].id, 'Alpha');
  assert.equal(fip.draft.albums[0].date, '2026-11-13');
  assert.equal(fip.draft.number, manualDraft.number);
  assert.equal(fip.draft.startsOn, manualDraft.startsOn);
  assert.equal(fip.draft.albumWindowStart, '2026-11-09');
  assert.equal(fip.draft.albumWindowStart, manualDraft.albumWindowStart);
  assert.match(fip.draft.mixes[0].reason, /DJ set musical/);
  assert.deepEqual(fip.rejected.map(row => row.id), ['Old', 'Future', 'Review', 'Jazzafip', 'Unchecked']);
  assert.ok(fip.rejected.some(row => row.id === 'Old' && /14 derniers jours/.test(row.reason)));
  assert.ok(!fip.draft.mixes.some(row => /jazz/i.test(row.title)));
});

test('feedback, duplicate artists, previously seen links and missing quotas are reported', () => {
  const candidates = [
    ...completeCandidates.filter(row => !['Gamma', 'Live'].includes(row.id)),
    album('Also Alpha', {creator: 'Alpha'}),
  ];
  const result = weeklyShortlist({ ...readyOptions, candidates, seen: {'https://publisher.test/content/Beta': '2026-11-15'}, profile: {
    ...emptyTasteProfile(), signals: {
      items: [{ id: 'Jazzafip', saved: true, reaction: 'Loved' }, { id: 'Nova Danse', saved: false, reaction: 'Not for me' }],
      curators: [],
    },
  } });
  assert.deepEqual(result.gaps, {live: 1});
  assert.equal(result.selected.live.length, 2);
  assert.equal(result.complete, false);
  assert.equal(result.selected.nova[0].item.id, 'Nova Danse');
  assert.match(result.selected.nova[0].reason, /Pas pour moi/);
  assert.ok(result.rankings.find(row => row.item.id === 'Beta').previouslySeen);
});

test('hearts and thumbs-down affect future artists without penalizing an unrelated source', () => {
  const options = {...readyOptions, candidates: [
    album('Fresh loved', {creator:'Future Star',genre:'Soul'}),
    album('Fresh disliked', {creator:'Avoid Artist',genre:'Folk'}),
    album('Unrelated', {creator:'Someone Else',genre:'Rock'}),
  ]};
  const profile = {
    ...emptyTasteProfile(),
    signals: {curators:[], items:[
      {id:'old-loved', saved:false, reaction:'Loved', creator:'Future Star', genre:'Soul'},
      {id:'old-disliked', saved:false, reaction:'Not for me', creator:'Avoid Artist', genre:'Folk'},
    ]},
  };
  const ranked = weeklyShortlist({...options,profile});
  const neutral = weeklyShortlist({...options,profile:emptyTasteProfile()});
  const get = (report,id) => report.rankings.find(entry => entry.item.id === id);
  assert.ok(get(ranked,'Fresh loved').score > get(neutral,'Fresh loved').score);
  assert.ok(get(ranked,'Fresh disliked').score < get(neutral,'Fresh disliked').score);
  assert.equal(get(ranked,'Unrelated').score,get(neutral,'Unrelated').score);
  assert.match(get(ranked,'Fresh loved').reason,/artiste déjà apprécié/i);
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

test('the 14-day album gate rejects old recommendations even with verified editorial citations', () => {
  const report = weeklyShortlist({ ...readyOptions, profile: emptyTasteProfile(), candidates: [
    album('Inside', { releaseDate: '2026-11-09' }),
    album('Outside', { releaseDate: '2022-11-08' }),
    album('Last year', {releaseDate:'2025-11-28'}),
  ] });
  assert.equal(report.draft.albumWindowStart, '2026-11-09');
  assert.deepEqual(report.draft.albums.map(item => item.id), ['Inside']);
  assert.ok(report.rejected.some(row => row.id === 'Outside' && /14 derniers jours/.test(row.reason)));
  assert.ok(report.rejected.some(row => row.id === 'Last year' && /14 derniers jours/.test(row.reason)));
});

test('album source diversity is preferred over repeating one publication', () => {
 const rows=[
  album('A',{source:'Label A',editorialSource:'Bandcamp Daily'}),
  album('B',{source:'Label B',editorialSource:'Bandcamp Daily'}),
  album('C',{source:'Label C',editorialSource:'Pitchfork',editorialKind:'critic-pick',editorialUrl:'https://pitchfork.com/reviews/albums/artist-release'}),
 ];
 const report=weeklyShortlist({...readyOptions,candidates:rows,profile:emptyTasteProfile()});
 assert.equal(report.selected.albums.length,3);
 assert.equal(report.selected.albums[0].item.id,'C');
});

test('jazz does not enter albums, radio shows, mixes, playlists or verified live picks', () => {
  const candidates=[
    album('Jazz record',{genre:'Jazz',source:'Preferred label'}),
    album('Experimental jazz',{tags:['free jazz']}),
    album('ECM record',{source:'ECM',provider:'ECM'}),
    album('Soul record',{genre:'Soul'}),
    radio('Jazzafip replay','FIP'),
    radio('Nova replay','Radio Nova'),
    item('Jazz playlist','Playlist',{genre:'Jazz',url:'https://open.spotify.com/playlist/64WCJyxoGnhFHdDe6LYwNG'}),
    item('Jazz live','Live session',{genre:'Jazz',minutes:24,verificationStatus:'performance-verified'}),
  ];
  const report=weeklyShortlist({...readyOptions,candidates,profile:{...emptyTasteProfile(),favoriteRadios:['FIP'],favoritePublications:['ECM']}});
  assert.deepEqual(report.selected.albums.map(row=>row.item.id),['Soul record']);
  assert.deepEqual(report.selected.nova.map(row=>row.item.id),['Nova replay']);
  assert.ok(report.rejected.filter(row=>row.reason==='Jazz exclu des recommandations').length>=5);
  assert.equal(excludesJazz({format:'Album',source:'ECM',title:'No genre supplied'}),true);
});

test('verified artists are extracted from YouTube titles and never repeated across live videos', () => {
  assert.equal(livePerformer('SLIFT - The Village (Live on KEXP)'), 'SLIFT');
  assert.equal(livePerformer('SLIFT - Full Performance (Live on KEXP)'), 'SLIFT');
  assert.equal(livePerformer('Jorja Smith - Blue Lights | A COLORS SHOW'),'Jorja Smith');
  assert.equal(livePerformer('Rosalía: Tiny Desk Concert'),'Rosalía');
  assert.equal(livePerformer('Rachel Chinouriri - Pretty Girls (BBC Radio 1 Live Lounge)'),'Rachel Chinouriri');
  const makeLive=(name,title)=>item(name,'Live session',{creator:livePerformer(title),title,sourceId: name.startsWith('slift')?'kexp':name,minutes:6,verificationStatus:'performance-verified'});
  const candidates=[
    makeLive('slift1','SLIFT - The Village (Live on KEXP)'),
    makeLive('slift2','SLIFT - Full Performance (Live on KEXP)'),
    makeLive('jorja','Jorja Smith - Blue Lights | A COLORS SHOW'),
    makeLive('rosalia','Rosalía: Tiny Desk Concert'),
    album('First'),album('Second'),album('Third'),
    item('NTS','Radio show',{url:'https://www.nts.live/shows/show/episodes/other',mixKind:'dj-set',sourceId:'nts-test'}),
    radio('Nova Danse','Radio Nova'),
    item('Playlist','Playlist',{url:'https://open.spotify.com/playlist/64WCJyxoGnhFHdDe6LYwNG'}),
  ];
  const report=weeklyShortlist({...readyOptions,candidates,profile:emptyTasteProfile()});
  assert.equal(report.selected.live.length,3);
  assert.deepEqual(new Set(report.draft.live.map(row=>row.creator)).size,3);
});

test('recent editorially reviewed albums win over equally curated older releases',()=>{
 const candidates=[
  album('Recent',{releaseDate:'2026-11-18',creator:'New release'}),
  album('Older inside window',{releaseDate:'2026-11-10',creator:'Another artist'}),
  album('Well reviewed but stale',{releaseDate:'2021-06-01',creator:'Great artist',editorialKind:'critic-pick',editorialSource:'Pitchfork',editorialUrl:'https://pitchfork.com/reviews/albums/a'}),
 ];
 const report=weeklyShortlist({...readyOptions,candidates,profile:emptyTasteProfile()});
 assert.equal(report.selected.albums[0].item.id,'Recent');
 assert.ok(report.rejected.some(row => row.id === 'Well reviewed but stale'));
 assert.ok(report.rankings.find(row=>row.item.id==='Recent').score>report.rankings.find(row=>row.item.id==='Older inside window').score);
});

test('short publisher preferences match fuller programme names without matching partial words',()=>{
 const preferred=weeklyShortlist({...readyOptions,candidates:[
  album('Favourite label album',{source:'Brownswood Recordings'}),
  album('Other label album',{source:'Unknown label'}),
  item('Live KEXP','Live session',{creator:'Other Artist',source:'KEXP · Live on KEXP',sourceId:'kexp-live',verificationStatus:'performance-verified',minutes:8}),
 ],profile:{...emptyTasteProfile(),favoritePublications:['Brownswood','KEXP']}});
 const neutral=weeklyShortlist({...readyOptions,candidates:[
  album('Favourite label album',{source:'Brownswood Recordings'}),
  album('Other label album',{source:'Unknown label'}),
  item('Live KEXP','Live session',{creator:'Other Artist',source:'KEXP · Live on KEXP',sourceId:'kexp-live',verificationStatus:'performance-verified',minutes:8}),
 ],profile:emptyTasteProfile()});
 const ranked=(report,id)=>report.rankings.find(row=>row.item.id===id)?.score;
 assert.ok(ranked(preferred,'Favourite label album')>ranked(neutral,'Favourite label album'));
 assert.ok(ranked(preferred,'Live KEXP')>ranked(neutral,'Live KEXP'));
 assert.ok(!preferred.rankings.some(row=>row.item.id==='Other label album'
   && row.signals.some(signal=>/Source parmi tes préférées|Média ou curateur recommandé/.test(signal))));
});

test('label catalogue presence is not an editorial recommendation',()=>{
 const rows=[album('Catalog only',{editorialKind:undefined,editorialUrl:undefined,source:'Brownswood Recordings'}),
   album('Ordinary review',{editorialKind:'review',editorialSource:'Pitchfork',editorialUrl:'https://pitchfork.com/reviews/albums/ordinary-review'}),
   album('Fake recommendation',{editorialKind:'critic-pick',editorialSource:'Pitchfork',editorialUrl:'https://publisher.test/fiction'}),
   album('Curated',{editorialKind:'curator-pick'})];
 const ranked=weeklyShortlist({...readyOptions,candidates:rows,profile:emptyTasteProfile()});
 assert.deepEqual(ranked.selected.albums.map(row=>row.item.id),['Curated']);
 assert.equal(ranked.rejected.length,3);
 assert.ok(ranked.rejected.every(row=>/recommandation éditoriale/.test(row.reason)));
 assert.equal(editorialEndorsement(rows[0]),undefined);
});

test('an older live matching tastes wins over a new unrelated live',()=>{
 const live=(id,age,creator,genre,source='KEXP · Live on KEXP')=>item(id,'Live session',{
  creator,source,sourceId:source.startsWith('NPR')?'npr-tiny-desk':'kexp-live',genre,date:age,
  minutes:12,verificationStatus:'performance-verified'});
 const candidates=[
  live('fresh','2026-11-18','Other','Metal'),
  live('old','2018-05-16','Khruangbin','funk','NPR Music · Tiny Desk Concert'),
 ];
 const profile={...emptyTasteProfile(),favoriteArtists:['Khruangbin'],explore:['funk']};
 const ranked=weeklyShortlist({...readyOptions,candidates,profile});
 const neutral=weeklyShortlist({...readyOptions,candidates,profile:emptyTasteProfile()});
 assert.equal(ranked.selected.live[0].item.id,'old');
 assert.ok(ranked.selected.live[0].score>ranked.rankings.find(row=>row.item.id==='fresh').score);
 assert.equal(neutral.rankings.find(row=>row.item.id==='old').score,
   neutral.rankings.find(row=>row.item.id==='fresh').score);
});

test('a curator recommendation is not accepted merely by claiming a trusted publisher name',()=>{
 const untrusted=album('Claimed',{editorialUrl:'https://daily.bandcamp.com/genres/jazz',editorialKind:'curator-pick'});
 const report=weeklyShortlist({...readyOptions,candidates:[untrusted],profile:emptyTasteProfile()});
 assert.equal(report.selected.albums.length,0);
 assert.equal(report.rejected[0].reason,'Aucune recommandation éditoriale vérifiée');
});

test('the weekly mix pool rejects interviews, old replays, talk shows and future broadcasts',()=>{
 const base={format:'Radio show',mixKind:'dj-set',title:'Nova Danse : guest DJ set',date:'2026-11-20'};
 assert.equal(isFreshMusicMix(base,'2026-11-23','2026-11-22'),true);
 assert.equal(isFreshMusicMix({...base,date:'2026-11-15'},'2026-11-23','2026-11-22'),false);
 assert.equal(isFreshMusicMix({...base,date:'2026-11-23'},'2026-11-23','2026-11-22'),false);
 assert.equal(isFreshMusicMix({...base,title:'Interview de DJ'},'2026-11-23','2026-11-22'),false);
 assert.equal(isFreshMusicMix({...base,title:'Invités dans Nova Club'},'2026-11-23','2026-11-22'),false);
 assert.equal(isFreshMusicMix({...base,mixKind:undefined},'2026-11-23','2026-11-22'),false);
 const candidates=[...completeCandidates,
   radio('Nova talk','Radio Nova'),radio('Nova real','Radio Nova')].map(x=>x.id==='Nova talk'
   ? {...x,title:'interview invité de la semaine',date:'2026-11-20'}:x);
 const report=weeklyShortlist({...readyOptions,candidates,profile:emptyTasteProfile()});
 assert.ok(!report.draft.mixes.some(x=>/interview/i.test(x.title)));
 assert.ok(report.rejected.some(x=>x.id==='Nova talk'&&/DJ mix/.test(x.reason)));
});

test('three live performances must come from three distinct music studios',()=>{
 const candidates=[...completeCandidates.filter(row=>row.format!=='Live session'),
   ...['one','two','three','four'].map((id,index)=>item('Live '+id,'Live session',{
     creator:'Artist '+id,sourceId:index===3?'colors':'npr',
     minutes:10,verificationStatus:'performance-verified'}))];
 const result=weeklyShortlist({...readyOptions,candidates,profile:emptyTasteProfile()});
 assert.equal(result.selected.live.length,2);
 assert.equal(result.gaps.live,1);
 assert.equal(result.complete,false);
});

test('an eligible YouTube music mix occupies the mandatory slot',()=>{
  const youtube=youtubeMix('Soul selection',{
    creator:'Soul Vinyl Curator',source:'YouTube · Soul Vinyl Curator',provider:'YouTube',audienceVerified:true,viewCount:150000,mixStyle:'soul',mixStyleVerified:true,
    sourceId:'youtube-mix-UC'+'A'.repeat(22),mixKind:'curated-mix',
    url:'https://www.youtube.com/watch?v=3C01eaL5_Xw',sourceUrl:'https://www.youtube.com/channel/UC'+'A'.repeat(22),
    videoSourceUrl:'https://www.youtube.com/watch?v=3C01eaL5_Xw',
    officialVideo:true,embed:{provider:'youtube',id:'3C01eaL5_Xw'},
    date:'2026-11-17',minutes:58,verificationStatus:'source-verified'});
  const report=weeklyShortlist({...readyOptions,candidates:[...completeCandidates,youtube],profile:emptyTasteProfile()});
  assert.equal(report.selected.nts[0].item.id,'NTS');
  assert.equal(report.selected.youtube[0].item.id,'Soul selection');
  assert.deepEqual(report.draft.mixes.map(x=>x.id),['NTS','Nova Danse','Soul selection']);
});

test('a named vinyl DJ mix outranks a generic automated-looking YouTube compilation',()=>{
 const channel=variant=>'UC'+variant.repeat(22);
 const youtube=(id,title,creator,variant)=>item(id,'Radio show',{
   title,creator,source:'YouTube · '+creator,provider:'YouTube',sourceId:'youtube-mix-'+channel(variant),
   mixKind:'curated-mix',date:'2026-11-17',verificationStatus:'source-verified',audienceVerified:true,
   mixStyle:id==='Generic'?'funk':'rnb',mixStyleVerified:true,viewCount:150000,subscriberCount:80000,minutes:50,
   url:'https://www.youtube.com/watch?v='+('a'.repeat(10)+variant),
   sourceUrl:'https://www.youtube.com/channel/'+channel(variant),
   videoSourceUrl:'https://www.youtube.com/watch?v='+('a'.repeat(10)+variant),
   embed:{provider:'youtube',id:'a'.repeat(10)+variant},officialVideo:true,
 });
 const generic=youtube('Generic','Best Vintage Funk Mix 2026','Music Mixes','A');
 const real=youtube('Actual DJ','All-vinyl 80s R&B Soul Hip Hop DJ Mix | DJ Tommy Samuel','DJ Tommy Samuel','B');
 const result=weeklyShortlist({...readyOptions,candidates:[...completeCandidates,generic,real],profile:emptyTasteProfile()});
 assert.equal(result.selected.youtube[0].item.id,'Actual DJ');
 assert.ok(result.rankings.find(row=>row.item.id==='Actual DJ').score
   > result.rankings.find(row=>row.item.id==='Generic').score);
});

test('edition needs one NTS, one Nova and one verified YouTube DJ mix',()=>{
 const incomplete=weeklyShortlist({...readyOptions,candidates:completeCandidates.filter(x=>x.id!=='YouTube mix'),profile:emptyTasteProfile()});
 assert.equal(incomplete.complete,false);assert.equal(incomplete.gaps.youtube,1);
 const complete=weeklyShortlist({...readyOptions,candidates:completeCandidates,profile:emptyTasteProfile()});
 assert.equal(complete.complete,true);
 assert.deepEqual(complete.draft.mixes.map(x=>x.id),['NTS','Nova Danse','YouTube mix']);
 assert.equal(complete.draft.mixPolicy,'nts-nova-youtube-v1');
});
test('Nova may use its last real DJ set from ten days ago',()=>{
 const older=radio('Nova ten days','Radio Nova');older.date='2026-11-13';
 assert.equal(isFreshMusicMix(older,'2026-11-23','2026-11-22'),true);
 assert.equal(isFreshMusicMix({...older,date:'2026-11-08'},'2026-11-23','2026-11-22'),false);
 const r=weeklyShortlist({...readyOptions,candidates:[...completeCandidates.filter(x=>x.id!=='Nova Danse'),older],profile:emptyTasteProfile()});
 assert.equal(r.selected.nova[0].item.id,'Nova ten days');
});

test('YouTube slot refuses a highly subscribed channel video below 100k views',()=>{
 const low=youtubeMix('Under 100k',{viewCount:99999,subscriberCount:900000});
 const report=weeklyShortlist({...readyOptions,
  candidates:[...completeCandidates.filter(x=>x.id!=='YouTube mix'),low],profile:emptyTasteProfile()});
 assert.equal(report.selected.youtube.length,0);
 assert.equal(report.gaps.youtube,1);
 assert.ok(report.rejected.some(x=>x.id==='Under 100k'&&/100 000 vues/.test(x.reason)));
});
test('a popular electro video must not enter the weekly YouTube mix slot',()=>{
 const electro=youtubeMix('Electro',{title:'Electro Techno DJ set',mixStyle:'rnb',viewCount:3000000});
 const report=weeklyShortlist({...readyOptions,
  candidates:[...completeCandidates.filter(x=>x.id!=='YouTube mix'),electro],
  profile:emptyTasteProfile()});
 assert.equal(report.selected.youtube.length,0);
 assert.ok(report.rejected.some(x=>x.id==='Electro'&&/électro/.test(x.reason)));
});
test('a relevant soulful mix published months ago can qualify once it reaches 100k views',()=>{
 const one=youtubeMix('Soulful older',{date:'2026-07-12',mixStyle:'soul',viewCount:285000});
 const report=weeklyShortlist({...readyOptions,
  candidates:[...completeCandidates.filter(x=>x.id!=='YouTube mix'),one],profile:emptyTasteProfile()});
 assert.equal(report.selected.youtube[0].item.id,'Soulful older');
 assert.equal(report.complete,true);
});
