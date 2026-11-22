import assert from 'node:assert/strict';
import {test} from 'node:test';
import {collectionRecommendations,recommendationSnapshot,restoreLibrary,toggleSaved,libraryStorageKey} from '../app/library-store.mjs';

const lastWeek={
 id:'spotify-previous',title:'Previous week album',creator:'A real musician',format:'Album',
 source:'Bandcamp Daily',url:'https://open.spotify.com/album/1234567890123456789012',
 artwork:'https://i.scdn.co/image/album-cover',editorialUrl:'https://daily.bandcamp.com/reviews',
 date:'2026-11-16',note:'Worth discovering',
};
const currentWeek={id:'youtube-current',title:'New mix',format:'Radio show',source:'YouTube',
 url:'https://www.youtube.com/watch?v=K6en74gqBSM',
 embed:{provider:'youtube',id:'K6en74gqBSM'},artwork:'https://i.ytimg.com/vi/K6en74gqBSM/maxresdefault.jpg'};
const blank=()=>({entries:{},playlists:[],radioTracks:{},curators:[],savedItems:{}});

test('saving an album captures its cover, artist, Spotify link and editorial source',()=>{
 const state=toggleSaved(blank(),lastWeek);
 assert.equal(state.entries[lastWeek.id].saved,true);
 assert.equal(state.savedItems[lastWeek.id].artwork,lastWeek.artwork);
 assert.equal(state.savedItems[lastWeek.id].url,lastWeek.url);
 assert.equal(state.savedItems[lastWeek.id].editorialUrl,lastWeek.editorialUrl);
});

test('previous-edition saved content survives a reload even when it is absent from the current catalogue',()=>{
 const saved=toggleSaved(blank(),lastWeek);
 const afterReload=restoreLibrary(JSON.parse(JSON.stringify(saved)),[currentWeek]);
 const visible=collectionRecommendations([currentWeek],afterReload.savedItems);
 assert.deepEqual(visible.map(x=>x.id),[lastWeek.id,currentWeek.id]);
 assert.equal(visible.find(x=>x.id===lastWeek.id)?.artwork,lastWeek.artwork);
 assert.equal(visible.find(x=>x.id===lastWeek.id)?.url,lastWeek.url);
});

test('a saved YouTube video retains its player after the recommendation disappears',()=>{
 const saved=toggleSaved(blank(),currentWeek);
 const restored=restoreLibrary(JSON.parse(JSON.stringify(saved)),[]);
 assert.deepEqual(collectionRecommendations([],restored.savedItems)[0].embed,currentWeek.embed);
});

test('unbookmarking removes the archival card but keeps any reaction intact',()=>{
 const saved=toggleSaved({...blank(),entries:{[lastWeek.id]:{reaction:'Loved'}}},lastWeek);
 const cleared=toggleSaved(saved,lastWeek);
 assert.equal(cleared.entries[lastWeek.id].saved,false);
 assert.equal(cleared.entries[lastWeek.id].reaction,'Loved');
 assert.deepEqual(cleared.savedItems,{});
 assert.deepEqual(collectionRecommendations([],cleared.savedItems),[]);
});

test('old v1 bookmark-only libraries are migrated from recommendations still available',()=>{
 const old={entries:{[lastWeek.id]:{saved:true},'never-found':{saved:true},[currentWeek.id]:{saved:false}},
  playlists:[],radioTracks:{},curators:['Mr Bongo']};
 const restored=restoreLibrary(old,[lastWeek,currentWeek]);
 assert.equal(restored.savedItems[lastWeek.id].title,lastWeek.title);
 assert.equal(restored.savedItems['never-found'],undefined);
 assert.deepEqual(restored.curators,['Mr Bongo']);
 assert.equal(libraryStorageKey,'off-frequency.library.v1');
});

test('an unsaved recommendation does not become a permanently saved card',()=>{
 const old={...blank(),entries:{[currentWeek.id]:{saved:false}},
  savedItems:{[currentWeek.id]:currentWeek}};
 assert.deepEqual(restoreLibrary(old,[]).savedItems,{});
});

test('a recommended item present in an old and current edition is not duplicated',()=>{
 const saved=toggleSaved(blank(),lastWeek);
 const newlyEdited={...lastWeek,title:'Updated title',artwork:'https://i.scdn.co/image/new-cover'};
 const items=collectionRecommendations([newlyEdited],saved.savedItems);
 assert.equal(items.length,1);
 assert.equal(items[0].title,'Updated title');
});

test('invalid or incomplete stored cards are ignored, preserving valid saved entries',()=>{
 const corrupt={...blank(),entries:{corrupt:{saved:true},[lastWeek.id]:{saved:true}},
  savedItems:{corrupt:{id:'corrupt',title:'Oops',url:'javascript:bad'},[lastWeek.id]:lastWeek}};
 assert.deepEqual(Object.keys(restoreLibrary(corrupt,[]).savedItems),[lastWeek.id]);
 assert.equal(recommendationSnapshot({id:'bad',title:'Bad',url:'https://example.com'}),null);
});
