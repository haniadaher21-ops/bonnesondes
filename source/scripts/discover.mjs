import { mkdir, writeFile } from 'node:fs/promises';
import { discover, renderReport } from './discovery.mjs';
import { editionItems, legacyItems, publishedFile, readJson } from './editorial-files.mjs';

const result = await discover({
  sources: readJson(new URL('../editorial/sources.json', import.meta.url)),
  manual: readJson(new URL('../editorial/manual-candidates.json', import.meta.url)),
  existing: [...legacyItems, ...readJson(publishedFile).flatMap(editionItems)],
});

const output = new URL('../.discovery/', import.meta.url);
await mkdir(output, { recursive: true });
const report = renderReport(result);
await Promise.all([
  writeFile(new URL('rapport.md', output), report),
  writeFile(new URL('candidats.json', output), JSON.stringify(result, null, 2) + '\n'),
]);
console.log(report);
