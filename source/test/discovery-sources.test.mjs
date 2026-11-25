import assert from 'node:assert/strict';
import { test } from 'node:test';
import { discover, renderReport } from '../scripts/discovery.mjs';
import { emptyTasteProfile, normalizeTasteProfile } from '../editorial/taste-profile.mjs';
import configuredSources from '../editorial/sources.json' with {type:'json'};
import { isDedicatedNovaMixEpisode } from '../scripts/nova-mixes.mjs';
import { isNovaMix, isFipTape, isFreshMusicMix, livePerformer } from '../scripts/recommendation-policy.mjs';

const rss = items => '<rss><channel>' + items.join('') + '</channel></rss>';
const xmlItem = (title, url, extra = '') => '<item><title>' + title + '</title><link>' + url
  + '</link><pubDate>Wed, 18 Nov 2026 05:03:00 +0000</pubDate>' + extra + '</item>';
const makeSource = (id, method, url, itemPrefix, format, extra = {}) => ({
  id, name: id, mode: 'automatic', method, url, itemPrefix, format, feed: url + '/feed', ...extra,
});
const playlistId = '64WCJyxoGnhFHdDe6LYwNG';
const playlist = 'https://open.spotify.com/playlist/' + playlistId;
const spotify = () => Response.json({
  title: 'Weekly selections', provider_name: 'Spotify', iframe_url: 'https://open.spotify.com/embed/playlist/' + playlistId,
});

test('publisher RSS keeps the review date distinct from release and only emits individual official replays', async () => {
  const review = 'https://pitchfork.com/reviews/albums/example';
  const fip = 'https://www.radiofrance.fr/fip/podcasts/jazz/individual';
  const nova = 'https://podcasts.nova.fr/club/individual';
  const sources = [
    makeSource('pitchfork', 'pitchfork-rss', 'https://pitchfork.com', '/reviews/', 'Album'),
    makeSource('fip', 'podcast-rss', 'https://www.radiofrance.fr', '/fip/podcasts/jazz/', 'Radio show'),
    makeSource('nova', 'podcast-rss', 'https://podcasts.nova.fr', '/club/', 'Radio show'),
  ];
  const feeds = new Map([
    [sources[0].feed, rss([xmlItem('Tender', review, '<dc:creator>Critic Name</dc:creator>')])],
    [sources[1].feed, rss([xmlItem('Club replay', fip), xmlItem('Show page', fip.replace('/individual', ''))])],
    [sources[2].feed, rss([xmlItem('Nova replay', nova + '?utm_source=feed'), xmlItem('Wrong host', 'https://elsewhere.test/club/episode')])],
    [review, '<script type="application/ld+json">{"itemReviewed":{"name":"Artist: Tender"}}</script>'],
  ]);
  const result = await discover({ sources, fetcher: async url => new Response(feeds.get(url), {status: feeds.has(url) ? 200 : 503}) });
  const [album, fipItem, novaItem] = result.candidates;
  assert.deepEqual(result.candidates.map(item => item.url), [review, fip, nova]);
  assert.equal(album.creator, 'Artist');
  assert.equal(album.dateKind, 'published');
  assert.equal(album.releaseDate, undefined);
  assert.equal(album.verificationStatus, 'release-date-needed');
  assert.equal(fipItem.sourceId, 'fip');
  assert.equal(novaItem.sourceUrl, sources[2].feed);
  assert.equal(result.coverage.Album.needsReleaseDate, 1);
  assert.match(renderReport(result), /date originale à vérifier/);
});

test('official label Atom and Bandcamp newsletter preserve leads and validate playlist embeds', async () => {
  const source = makeSource('label', 'label-atom', 'https://label.test', '/blogs/news/', 'Album');
  const bandcamp = makeSource('notes', 'bandcamp-notes', 'https://bandcamp.substack.com', '/p/', 'Album');
  const story = 'https://label.test/blogs/news/story';
  const bandcampAlbum = 'https://artist.bandcamp.com/album/tender';
  const links = '<a href="' + playlist + '">Playlist</a><a href="' + bandcampAlbum + '">Album</a>';
  const atom = '<feed><entry><title>Label news</title><published>2026-11-17T09:00:00Z</published>'
    + '<link rel="alternate" href="' + story + '"/><content><![CDATA[' + links + ']]></content></entry></feed>';
  const notes = rss([xmlItem('I Love This Record - "Tender" by Artist', 'https://bandcamp.substack.com/p/tender')]);
  const result = await discover({ sources: [source, bandcamp], fetcher: async url => {
    if (url === source.feed) return new Response(atom);
    if (url === bandcamp.feed) return new Response(notes);
    assert.ok(url.startsWith('https://open.spotify.com/oembed?url='));
    return spotify();
  } });
  const [playlistItem, album] = result.candidates;
  assert.equal(playlistItem.id, 'spotify-' + playlistId);
  assert.equal(playlistItem.sourceUrl, story);
  assert.equal(playlistItem.verificationStatus, 'source-verified');
  assert.deepEqual(result.leads[0].bandcampUrls, [bandcampAlbum]);
  assert.equal(album.title, 'Tender');
  assert.equal(album.creator, 'Artist');
  assert.equal(album.releaseDate, undefined);
});

test('NTS supports independent series and includes only an official tracklist link', async () => {
  const sources = ['a', 'b'].map(show => makeSource(show, 'nts-episodes', 'https://www.nts.live/shows/' + show, '', 'Radio show'));
  const result = await discover({ sources, fetcher: async url => {
    const source = sources.find(source => source.feed === url);
    if (!source) return new Response('Replay');
    const {id} = source;
    return Response.json({results: [
      { status: 'published', show_alias: id, episode_alias: id + '-episode', broadcast: '2026-11-17T00:00:00Z', name: id,
        links: [{rel: 'tracklist', href: id === 'a' ? 'https://www.nts.live/api/v2/shows/a/episodes/a-episode/tracklist' : 'https://unrelated.test/tracklist'}] },
      { status: 'draft', show_alias: id, episode_alias: 'unpublished' },
    ]});
  } });
  assert.deepEqual(result.candidates.map(item => item.id), ['nts-a-episode', 'nts-b-episode']);
  assert.match(result.candidates[0].tracklistUrl, /a-episode\/tracklist$/);
  assert.equal(result.candidates[1].tracklistUrl, undefined);
  assert.equal(result.candidates[1].dateKind, 'broadcast');
});

test('YouTube skips Shorts and interviews and collapses repeated titles from an official channel', async () => {
  const source = makeSource('triple-j', 'youtube-atom', 'https://www.youtube.com/@triplej', '', 'Live session', {
    channelId: 'UCfixture', titleContains: 'like a version',
  });
  const entry = (id, title, path = 'watch?v=') => '<entry><yt:videoId>' + id + '</yt:videoId>'
    + '<yt:channelId>UCfixture</yt:channelId><title>' + title + '</title><published>2026-11-17T00:00:00Z</published>'
    + '<link rel="alternate" href="https://www.youtube.com/' + path + id + '"/></entry>';
  const xml = '<feed><yt:channelId>UCfixture</yt:channelId>'
    + entry('aaaaaaaaaaa', 'Artist covers Track for Like A Version', 'shorts/')
    + entry('bbbbbbbbbbb', 'Artist Interview for Like A Version')
    + entry('ccccccccccc', 'Artist covers Track for Like A Version')
    + entry('ddddddddddd', 'Artist covers Track for Like A Version!') + '</feed>';
  const requests = [];
  const result = await discover({ sources: [source], fetcher: async url => {
    if (!url.includes('/oembed')) return new Response(xml);
    requests.push(new URL(url).searchParams.get('url'));
    return Response.json({title: 'Artist covers Track for Like A Version'});
  } });
  assert.equal(requests.length, 2);
  assert.equal(result.candidates[0].id, 'youtube-ccccccccccc');
  assert.equal(result.candidates[0].videoKind, 'cover');
  assert.equal(result.duplicates[0].id, 'youtube-ddddddddddd');
});

test('preferences enable only catalogued artist channels and follow playlist URLs without account access', async () => {
  const profile = normalizeTasteProfile({
    ...emptyTasteProfile(), favoriteArtists: ['Artist'], favoriteRadios: ['FIP'],
    spotify: [{url: playlist}, {url: 'https://open.spotify.com/user/curator'}],
  });
  const sources = [
    makeSource('artist', 'youtube-atom', 'https://www.youtube.com/@artist', '', 'Live session',
      {artist: 'Artist', onlyWhenFollowed: true, channelId: 'UCartist'}),
    makeSource('other', 'youtube-atom', 'https://www.youtube.com/@other', '', 'Live session',
      {artist: 'Other', onlyWhenFollowed: true, channelId: 'UCother'}),
  ];
  const urls = [];
  const result = await discover({ sources, profile, fetcher: async url => {
    urls.push(url);
    return url.includes('open.spotify.com') ? spotify() : new Response('<feed><yt:channelId>UCartist</yt:channelId></feed>');
  } });
  assert.equal(urls.length, 2);
  assert.ok(urls.some(url => url.includes('UCartist')));
  assert.ok(urls.every(url => !url.includes('UCother')));
  assert.equal(result.sources[1].status, 'limited');
  assert.equal(result.candidates[0].url, playlist);
});

test('a rate limit suspends that host for the run while other providers finish', async () => {
  const sources = [
    makeSource('first', 'podcast-rss', 'https://limited.test/show-a', '/show-a/', 'Radio show'),
    makeSource('second', 'podcast-rss', 'https://limited.test/show-b', '/show-b/', 'Radio show'),
    makeSource('other', 'podcast-rss', 'https://other.test/club', '/club/', 'Radio show'),
  ];
  const requests = [];
  const result = await discover({ sources, fetcher: async url => {
    requests.push(url);
    if (url.includes('limited.test')) return new Response(null, {status: 429, headers: {'Retry-After': '60'}});
    return new Response(rss([xmlItem('Replay', 'https://other.test/club/replay')]));
  } });
  assert.equal(requests.filter(url => url.includes('limited.test')).length, 1);
  assert.deepEqual(result.sources.map(source => source.status), ['error', 'error', 'ok']);
  assert.equal(result.candidates[0].sourceId, 'other');
});

test('Nova Club is no longer a DJ recommendation source, and Nova Danse is a verified musical set feed',async()=>{
 assert.equal(configuredSources.some(x=>x.id==='nova-club'&&x.mode==='automatic'),false);
 const src=configuredSources.find(x=>x.id==='nova-danse');
 assert.equal(src.mixKind,'dj-set');
 assert.equal(src.feed,'https://podcasts.nova.fr/radio-nova-nova-danse/feed/rss/website.xml');
 const url='https://podcasts.nova.fr/radio-nova-nova-danse/202611202200-dj-set';
 const rss='<rss><channel><item><title>Nova Danse : DJ set</title><link>'+url+'</link>'
  +'<pubDate>Fri, 20 Nov 2026 22:00:00 +0100</pubDate></item></channel></rss>';
 const r=await discover({sources:[src],fetcher:async target=>
  new Response(target===src.feed?rss:'<html><title>Nova Danse DJ set</title></html>')});
 assert.equal(r.candidates.length,1);
 assert.equal(r.candidates[0].mixKind,'dj-set');
 assert.equal(r.candidates[0].date,'2026-11-20');
});


test('Nova Club episodes qualify only when clearly devoted to musical DJ sets',async()=>{
 const src=configuredSources.find(x=>x.id==='nova-club-mixes');
 assert.ok(src?.mode==='automatic');
 const base='https://podcasts.nova.fr/radio-nova-nova-club/';
 const fixture=rss([
  xmlItem('Les news : Âme, Bicep et autres nouveautés',base+'202611181700-les-news'),
  xmlItem('Le Club du Vendredi : Thundercat et un mix de Melvin !',base+'202611171700-club-melvin'),
  xmlItem('Mix Bob Sinclar et DJ Yellow dans le Nova Club !',base+'202611201800-bob-sinclar-yellow'),
  xmlItem('Tout en mix ! BOUKAN RECORDS aux platines !',base+'202611191800-boukan-mix'),
  xmlItem('CASSIUS : Mix plus interview',base+'202611181200-cassius-mix-interview'),
 ]);
 const result=await discover({sources:[src],fetcher:async url=>
  new Response(url===src.feed?fixture:'<html>Radio Nova</html>')});
 assert.equal(result.candidates.length,2);
 assert.ok(result.candidates.every(x=>x.novaMixVerified===true && isNovaMix(x)));
 assert.equal(isDedicatedNovaMixEpisode('Paf et Regelegorila sont nos invités !',src.mixSelection),false);
});

test('Worldmix and Teuf d’appart are music series; stale episodes remain rejected by weekly freshness',async()=>{
 for(const id of ['nova-worldmix','nova-teuf-appart']){
  const src=configuredSources.find(x=>x.id===id);
  assert.equal(src?.mode,'automatic');
  const title=id==='nova-worldmix'?'Worldmix : un mix caribéen':'Teuf d’appart avec Get A Room';
  const url=src.url+'/202611181500-set';
  const result=await discover({sources:[src],fetcher:async target=>
    new Response(target===src.feed?rss([xmlItem(title,url)]):'<html>Nova DJ set</html>')});
  assert.equal(result.candidates.length,1);
  assert.equal(result.candidates[0].novaMixVerified,true);
  assert.equal(isNovaMix(result.candidates[0]),true);
 }
});

test('new live sources identify actual artists and filter non-performance uploads',async()=>{
 const titles={
  'blogotheque':'Rostam - In a River | Live Session',
  'mahogany':'Artist - Song | Mahogany Session',
  'audiotree':'INOHA on Audiotree Live (Full Session)',
  'arte-concert':'BERWYN - Braths Sessions - ARTE Concert',
 };
 const expected=['Rostam','Artist','INOHA','BERWYN'];
 const sources=Object.keys(titles).map(id=>configuredSources.find(x=>x.id===id));
 assert.ok(configuredSources.some(x=>x.id==='npr-tiny-desk'));
 for(const [index,source] of sources.entries()){
  const title=titles[source.id],id='aaaaaaaaaaa';
  const feed='<feed><yt:channelId>'+source.channelId+'</yt:channelId>'
   +'<entry><yt:videoId>'+id+'</yt:videoId><yt:channelId>'+source.channelId+'</yt:channelId><title>'+title+'</title><published>2026-11-17T00:00:00Z</published><link rel="alternate" href="https://www.youtube.com/watch?v='+id+'"/></entry>'
   +'<entry><yt:videoId>bbbbbbbbbbb</yt:videoId><yt:channelId>'+source.channelId+'</yt:channelId><title>Unrelated documentary</title><published>2026-11-17T00:00:00Z</published><link rel="alternate" href="https://www.youtube.com/watch?v=bbbbbbbbbbb"/></entry></feed>';
  const result=await discover({sources:[source],fetcher:async url=>url.includes('/oembed')?Response.json({title}):new Response(feed)});
  assert.equal(result.candidates.length,1,source.id);
  assert.equal(result.candidates[0].creator,expected[index],source.id);
  assert.equal(livePerformer(title),expected[index],source.id);
 }
});
test('FIP Tape is optional, individually verified and eligible within its own window',async()=>{
 const src=configuredSources.find(x=>x.id==='fip-tape');
 const url='https://www.radiofrance.fr/fip/podcasts/fip-tape/la-mixtape-de-james-blake-1234567';
 const xml=rss([xmlItem('La mixtape de James Blake',url),xmlItem('Podcast index',src.url)]);
 let confirmed=false;
 const result=await discover({sources:[src],fetcher:async target=>{
  if(target===src.feed)return new Response(xml);
  assert.equal(target,url);confirmed=true;return new Response('Episode');
 }});
 assert.equal(confirmed,true);
 assert.equal(result.candidates.length,1);
 assert.equal(isFipTape(result.candidates[0]),true);
 assert.equal(isFreshMusicMix(result.candidates[0],'2026-11-23','2026-11-22'),true);
 assert.equal(isFipTape({...result.candidates[0],url:'https://example.test/fip/podcasts/fip-tape/la-mixtape-de-james-blake-1234567'}),false);
});
