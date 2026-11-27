import assert from 'node:assert/strict';
import {test} from 'node:test';
import {bandcampDailyIdentity,bandcampDailyLinks,collectEditorialEndorsements,endorsedAlbum} from '../scripts/editorial-endorsements.mjs';

const review='https://daily.bandcamp.com/album-of-the-day/artist-album-review';
const release='https://artist.bandcamp.com/album/album';
const tralbum={artist:'Artist',current:{title:'Album',about:''},album_release_date:'13 Nov 2023 00:00:00 GMT'};
const structured={'@type':'MusicAlbum','@id':release,name:'Album',byArtist:{name:'Artist'},
  datePublished:'13 Nov 2023 00:00:00 GMT',albumReleaseType:'AlbumRelease',numTracks:11};
const albumHTML='<div data-tralbum="'+JSON.stringify(tralbum).replaceAll('"','&quot;')+'" >'
  +'</div><script type="application/ld+json">'+JSON.stringify(structured)+'</script>';

test('article pages explicitly name the album and artist, not just the publisher header',()=>{
 const html='<header><h1>Bandcamp Daily</h1></header><article>ALBUM OF THE DAY'
   +'<h1>Artist, “Album”</h1><a href="'+release+'">Listen</a></article>';
 assert.deepEqual(bandcampDailyIdentity(html),{title:'Album',creator:'Artist'});
 assert.deepEqual(bandcampDailyLinks('<a href="/album-of-the-day/artist-album-review">Pick</a>'
  +'<a href="/genres/jazz">Jazz</a>'),[review]);
 assert.equal(endorsedAlbum({title:'Other',creator:'Artist'},{title:'Album',creator:'Artist',url:review}),undefined);
 assert.equal(endorsedAlbum({title:'Album',creator:'Artist'},{title:'Album',creator:'Artist',url:'https://label.test/album'}),undefined);
});

test('only the verified original album linked from a real Bandcamp Daily editorial pick enters the recommendations',async()=>{
 const html='<header><h1>Bandcamp Daily</h1></header><article>ALBUM OF THE DAY'
   +'<h1>Artist, “Album”</h1><a href="'+release+'">Listen to album</a>'
   +'<a href="https://artist.bandcamp.com/album/unrelated">Also mentioned</a></article>';
 const request=async url=>{
   if(url==='https://daily.bandcamp.com/album-of-the-day')return new Response('<a href="/album-of-the-day/artist-album-review">Artist, Album</a>');
   if(url.endsWith('page=1'))return new Response('');
   if(url===review)return new Response(html);
   if(url===release)return new Response(albumHTML);
   return new Response('unavailable',{status:404});
 };
 const result=await collectEditorialEndorsements({fetcher:request});
 assert.equal(result.records.length,1);
 assert.equal(result.records[0].title,'Album');
 assert.equal(result.records[0].releaseDate,'2023-11-13');
 assert.equal(result.records[0].editorialUrl,review);
 assert.equal(result.records[0].editorialKind,'curator-pick');
 assert.equal(result.records[0].editorialClaim,'Album of the Day');
});
