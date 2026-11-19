import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { emptyTasteProfile } from '../editorial/taste-profile.mjs';
import { parisDate, editionItems } from '../editorial/edition.mjs';
import { collectAlbumCatalogues } from './album-catalogues.mjs';
import { discover } from './discovery.mjs';
import { legacyEdition, legacyItems, publishedFile, readJson } from './editorial-files.mjs';
import { verifyAlbums, verifyLives } from './weekly-evidence.mjs';
import { nextEditionMonday, weeklyShortlist } from './weekly-ranking.mjs';

const reports = [];
for (const favoriteRadios of [[],['FIP'],['Radio Nova']]) {
  const now = new Date();
  const profile = {...emptyTasteProfile(),favoriteRadios};
  const startsOn = nextEditionMonday(now);
  const sources = readJson(new URL('../editorial/sources.json',import.meta.url));
  const earlier = [legacyEdition,...readJson(publishedFile)];
  const [collection,catalogues] = await Promise.all([
    discover({sources,profile,existing:[...legacyItems,...earlier.flatMap(editionItems)],now}),
    collectAlbumCatalogues({startsOn,today:parisDate(now)}),
  ]);
  const evidence = await verifyAlbums([...catalogues.records,...readJson(new URL('../editorial/album-sources.json',import.meta.url))]);
  const videos = await verifyLives(collection.candidates,sources,process.env.YOUTUBE_DATA_API_KEY);
  const videoById = new Map(videos.items.map(item=>[item.id,item]));
  const report = weeklyShortlist({
    candidates:[...collection.candidates.map(item=>videoById.get(item.id) ?? item),
      ...evidence.flatMap(item=>item.candidate ? [item.candidate] : [])],
    profile,earlier,catalog:legacyItems,startsOn,now,sources:collection.sources,
  });
  reports.push({
    at:now.toISOString(),testProfile:favoriteRadios,complete:report.complete,gaps:report.gaps,
    albums:evidence.map(({title,sourceUrl,verifiedReleaseDate,candidate,reason})=>({title,sourceUrl,verifiedReleaseDate,eligible:!!candidate,reason})),
    catalogues:catalogues.status,live:videos.status,
    choices:Object.fromEntries(Object.entries(report.selected).map(([name,items])=>[name,items.map(({item})=>({title:item.title,url:item.url,source:item.source}))])),
    sourceErrors:collection.sources.filter(source=>source.errors.length).map(({sourceId,errors})=>({sourceId,errors})),
  });
}
const path=await mkdtemp(join(tmpdir(),'bonnes-ondes-observation-'));
await writeFile(join(path,'public-evidence.json'),JSON.stringify(reports,null,2)+'\n',{mode:0o600});
console.log('Trois observations publiques enregistrées dans '+path);
console.log(JSON.stringify(reports.map(({at,complete,gaps,testProfile})=>({at,complete,gaps,testProfile}))));
