// The collection is a personal archive, independent from which week's
// recommendations are included in the next site build.
export const libraryStorageKey = 'off-frequency.library.v1';

// Keep the actual cards, not just bookmark IDs. Images, titles, primary music
// links and embedded players survive even after the weekly edition rotates.
const snapshotFields = [
  'id','title','creator','format','source','publisher','url','artwork',
  'editorialSource','editorialUrl','date','minutes','mixStyle','viewCount',
  'mood','season','genre','note','reason','embed',
];
export function recommendationSnapshot(item) {
  if(!item || typeof item!=='object' || typeof item.id!=='string' || !item.id
    || typeof item.title!=='string' || typeof item.format!=='string'
    || typeof item.url!=='string' || !/^https:\/\//.test(item.url))return null;
  return Object.fromEntries(snapshotFields.filter(field=>item[field]!==undefined)
    .map(field=>[field,field==='embed'&&item.embed && typeof item.embed==='object'
      ? {...item.embed}:item[field]]));
}

const asRecord=value=>value&&typeof value==='object'&&!Array.isArray(value)?value:{};

/** Read the original v1 library without losing its reactions or playlists.
 * Reconstruct older bookmarks from any older edition still bundled on the site.
 */
export function restoreLibrary(raw, available=[]) {
  const original=asRecord(raw);
  const entries=asRecord(original.entries);
  const playlists=Array.isArray(original.playlists)?original.playlists:[];
  const radioTracks=asRecord(original.radioTracks);
  const curators=Array.isArray(original.curators)?original.curators:[];
  const savedBefore=asRecord(original.savedItems);
  const known=new Map([...available,...playlists,...Object.values(radioTracks)]
    .filter(item=>item && typeof item.id==='string').map(item=>[item.id,item]));
  const savedItems={};
  for(const [id,entry] of Object.entries(entries)){
    if(entry?.saved!==true)continue;
    const snapshot=recommendationSnapshot(savedBefore[id]??known.get(id));
    if(snapshot?.id===id)savedItems[id]=snapshot;
  }
  return {entries,playlists,radioTracks,curators,savedItems};
}

export function toggleSaved(library,item) {
  const current=library.entries[item.id]??{};
  const saved=current.saved!==true;
  const savedItems={...library.savedItems};
  if(saved) {
    const snapshot=recommendationSnapshot(item);
    if(snapshot)savedItems[item.id]=snapshot;
  }else delete savedItems[item.id];
  return {
    ...library,
    entries:{...library.entries,[item.id]:{...current,saved}},
    savedItems,
    radioTracks:item.format==='Track'&&saved
      ? {...library.radioTracks,[item.id]:{...library.radioTracks[item.id],...item}}
      : library.radioTracks,
  };
}

export function collectionRecommendations(available=[],savedItems={}) {
  // Current editorial metadata wins for still-published items. Otherwise the
  // reader's saved snapshot stays available even after the edition is removed.
  const items=new Map();
  for(const item of [...Object.values(asRecord(savedItems)),...available]) {
    if(item&&typeof item.id==='string'&&item.id)items.set(item.id,item);
  }
  return [...items.values()];
}
