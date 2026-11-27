import assert from 'node:assert/strict';
import {test} from 'node:test';
import {musicPressLinks,musicPressMentions,musicPressAlbumReferences} from '../scripts/music-press.mjs';
import {editorialEndorsement} from '../scripts/recommendation-policy.mjs';
const source={name:'Bandcamp Daily',method:'bandcamp-essential',listingUrl:'https://daily.bandcamp.com/essential-releases'};
const url='https://daily.bandcamp.com/essential-releases/essential-releases-november-20-2026';
test('Essential Releases is a dated, attributable album selection',()=>{
 const html='<meta property="article:published_time" content="2026-11-20T12:00:00Z"><h2>Example Artist, “Example Album”</h2><a href="https://artist.bandcamp.com/album/example">Listen</a><h2>Other Artist: Other Album</h2><a href="https://other.bandcamp.com/album/other">Listen</a>';
 assert.deepEqual(musicPressLinks('<a href="'+url+'">Pick</a>',source),[url]);
 const mentions=musicPressMentions(html,source,url,'2026-11-27');
 const records=musicPressAlbumReferences(html,url,mentions);
 assert.equal(records.length,2);
 assert.equal(records[0].creator,'Example Artist');
 assert.equal(records[0].sourceUrl,'https://artist.bandcamp.com/album/example');
 assert.ok(editorialEndorsement({...records[0],format:'Album'}));
 assert.deepEqual(musicPressMentions(html,source,url,'2027-01-01'),[]);
});