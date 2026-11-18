import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseTasteProfile } from '../editorial/taste-profile.mjs';
import { discover, renderReport } from './discovery.mjs';
import { editionItems, legacyItems, publishedFile, readJson } from './editorial-files.mjs';

const profilePath = process.env.TASTE_PROFILE_PATH;
if (profilePath && process.env.GITHUB_ACTIONS) {
  throw new Error('Les workflows GitHub Actions utilisent la fixture neutre.');
}

let profile;
try {
  const input = profilePath ? await readFile(profilePath, 'utf8')
    : await readFile(new URL('../editorial/taste-profile.example.json', import.meta.url), 'utf8');
  profile = parseTasteProfile(input);
} catch {
  throw new Error('Impossible de lire un profil de découverte version 1.');
}

const result = await discover({
  sources: readJson(new URL('../editorial/sources.json', import.meta.url)),
  manual: readJson(new URL('../editorial/manual-candidates.json', import.meta.url)),
  existing: [...legacyItems, ...readJson(publishedFile).flatMap(editionItems)],
  profile,
});

const output = profilePath
  ? pathToFileURL((await mkdtemp(join(tmpdir(), 'bonnes-ondes-decouverte-'))) + '/')
  : new URL('../.discovery/', import.meta.url);
await mkdir(output, { recursive: true });
const report = renderReport(result);
await Promise.all([
  writeFile(new URL('rapport.md', output), report, { mode: 0o600 }),
  writeFile(new URL('candidats.json', output), JSON.stringify(result, null, 2) + '\n', { mode: 0o600 }),
]);
console.log(profilePath ? 'Rapport privé enregistré dans ' + output.pathname : report);
