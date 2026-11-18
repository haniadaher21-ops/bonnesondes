import { mkdir, mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { canonicalUrl, isoDate } from '../editorial/edition.mjs';
import { parseTasteProfile } from '../editorial/taste-profile.mjs';
import { discover } from './discovery.mjs';
import { editionItems, legacyEdition, legacyItems, publishedFile, readJson } from './editorial-files.mjs';
import { normalized, verifyAlbums, verifyLives } from './weekly-evidence.mjs';
import { nextEditionMonday, weeklyShortlist } from './weekly-ranking.mjs';

const profilePath = process.env.TASTE_PROFILE_PATH;
const indexPath = process.env.DISCOVERY_INDEX_PATH;
if (process.env.GITHUB_ACTIONS && (profilePath || indexPath)) throw new Error('Le workflow public utilise le profil neutre sans index privé.');
if (process.argv.length > 3) throw new Error('Utilisation : npm run weekly -- [AAAA-MM-JJ]');
let profile;
try {
  profile = parseTasteProfile(await readFile(profilePath || new URL('../editorial/taste-profile.example.json', import.meta.url), 'utf8'));
} catch {
  throw new Error('Profil de goûts indisponible ou invalide.');
}

const now = new Date();
const startsOn = process.argv[2] ?? nextEditionMonday(now);
if (!isoDate(startsOn)) throw new Error('Date de début invalide.');
const sources = readJson(new URL('../editorial/sources.json', import.meta.url));
const earlier = [legacyEdition, ...readJson(publishedFile)];
const known = [...legacyItems, ...earlier.flatMap(editionItems)];
const knownUrls = new Set(known.map(item => canonicalUrl(item.url)));
const knownIds = new Set(known.map(item => item.id));
let seen = {};
if (indexPath) {
  try {
    const index = JSON.parse(await readFile(indexPath, 'utf8'));
    if (index.version !== 1 || !index.seen || Array.isArray(index.seen) || typeof index.seen !== 'object') throw new Error();
    seen = index.seen;
  } catch (error) {
    if (error.code !== 'ENOENT') throw new Error('Index de découverte indisponible ou invalide.');
  }
}

const [collection, registeredEvidence] = await Promise.all([
  discover({
    sources, existing: known, profile, now,
    manual: readJson(new URL('../editorial/manual-candidates.json', import.meta.url)),
  }),
  verifyAlbums(readJson(new URL('../editorial/album-sources.json', import.meta.url))),
]);
const linkedAlbums = collection.candidates
  .filter(item => item.format === 'Album' && item.creator)
  .flatMap(item => (item.primaryReleaseUrls ?? []).map(sourceUrl => ({
    title: item.title, creator: item.creator, label: new URL(sourceUrl).hostname, sourceUrl,
  }))).slice(0, 12);
const albumEvidence = [...registeredEvidence, ...await verifyAlbums(linkedAlbums)];
const albumIdentity = item => normalized(item.creator) + ':' + normalized(item.title);
const datesByAlbum = new Map();
for (const { candidate } of albumEvidence) {
  if (!candidate) continue;
  const key = albumIdentity(candidate);
  if (!datesByAlbum.has(key)) datesByAlbum.set(key, new Set());
  datesByAlbum.get(key).add(candidate.releaseDate);
}
for (const row of albumEvidence) {
  if (row.candidate && datesByAlbum.get(albumIdentity(row.candidate)).size > 1) {
    row.conflict = true;
    delete row.candidate;
  }
}
const lives = await verifyLives(collection.candidates, sources, process.env.YOUTUBE_DATA_API_KEY);
const liveById = new Map(lives.items.map(item => [item.id, item]));
const candidates = [
  ...albumEvidence.flatMap(result => result.candidate ? [result.candidate] : []),
  ...collection.candidates.map(item => liveById.get(item.id) ?? item),
];
const report = weeklyShortlist({
  candidates, sources: collection.sources, profile, earlier, catalog: legacyItems,
  startsOn, now, seen, tasteWeight: Number(process.env.TASTE_WEIGHT ?? 0.7),
});
report.albumEvidence = albumEvidence.map(({ title, sourceUrl, candidate, conflict }) => ({ title, sourceUrl, conflict, releaseDate: candidate?.releaseDate }));
report.liveEvidence = lives.status;
report.previouslySeenUnpublished = candidates.filter(item => !knownIds.has(item.id) && !knownUrls.has(canonicalUrl(item.url))
  && Object.hasOwn(seen, canonicalUrl(item.url))).length;
const playlists = new Map();
const originPriority = { published: 5, followed: 4, configured: 3, 'publisher-seen': 2, 'publisher-discovered': 1 };
for (const item of [...collection.candidates, ...collection.duplicates]) {
  if (item.format !== 'Playlist') continue;
  const url = canonicalUrl(item.url);
  let origin = item.playlistOrigin;
  if (knownUrls.has(url) || knownIds.has(item.id)) origin = 'published';
  else if (origin === 'publisher-discovered' && Object.hasOwn(seen, url)) origin = 'publisher-seen';
  if (originPriority[origin] > (originPriority[playlists.get(url)] ?? 0)) playlists.set(url, origin);
}
report.playlistCoverage = Object.fromEntries(Object.keys(originPriority)
  .map(origin => [origin, [...playlists.values()].filter(value => value === origin).length]));

const output = profilePath || indexPath ? await mkdtemp(join(tmpdir(), 'bonnes-ondes-semaine-'))
  : fileURLToPath(new URL('../.discovery/weekly/', import.meta.url));
await mkdir(output, { recursive: true, mode: 0o700 });
const md = value => String(value ?? '').replace(/[\r\n]/g, ' ').replace(/[\\<>\[\]_*]/g, '\\$&');
const lines = [
  '# Sélection proposée du ' + startsOn,
  report.personalized ? 'Classement avec profil de goûts.' : 'Profil neutre, classement selon les sources et les preuves.',
  report.complete ? 'Le brouillon respecte le schéma éditorial. À relire.' : 'Brouillon incomplet. Les quotas ou le schéma signalent les éléments manquants.',
  '## Choix proposés',
  ...Object.values(report.selected).flat().map(({ item, reason, score }) =>
    '- ' + md(item.title) + ' · ' + md(item.format) + ' · ' + score + ' points. ' + md(reason) + ' <' + item.sourceUrl + '>'),
  '## Vérification des albums',
  ...report.albumEvidence.map(item => '- ' + md(item.title) + ' · ' + (item.releaseDate ?? (item.conflict ? 'Dates contradictoires' : 'Date ou lien audio non confirmé')) + ' <' + item.sourceUrl + '>'),
  report.liveEvidence,
  'Playlists inédites issues d’un éditeur ' + report.playlistCoverage['publisher-discovered']
    + ' · éditeur, déjà vues ' + report.playlistCoverage['publisher-seen'] + ' · suivies ' + report.playlistCoverage.followed + ' · configurées ' + report.playlistCoverage.configured
    + ' · déjà au catalogue ' + report.playlistCoverage.published + '.',
  'Candidats déjà vus et hors catalogue ' + report.previouslySeenUnpublished + '.',
  '## Sources',
  ...report.sources.map(source => '- ' + md(source.name) + ' · ' + md(source.status) + ' · ' + source.count + ' candidat(s).'),
  '## Éléments manquants',
  ...Object.entries(report.gaps).map(([name, count]) => '- ' + name + ' · ' + count),
  ...report.errors.map(error => '- ' + md(error)),
];
for (const [name, contents] of [
  ['shortlist.json', JSON.stringify(report, null, 2)],
  ['shortlist.md', lines.join('\n\n')],
  ['edition-draft.json', JSON.stringify(report.draft, null, 2)],
]) await writeFile(join(output, name), contents + '\n', { mode: 0o600 });

if (indexPath) {
  const destination = resolve(indexPath);
  await mkdir(dirname(destination), { recursive: true, mode: 0o700 });
  const cutoff = now.getTime() - 90 * 86400000;
  const entries = new Map(Object.entries(seen).filter(([, timestamp]) => Date.parse(timestamp) >= cutoff));
  for (const item of candidates) {
    const key = canonicalUrl(item.url);
    if (key && item.playlistOrigin !== 'followed') entries.set(key, now.toISOString());
  }
  const stage = await mkdtemp(join(dirname(destination), '.bonnes-ondes-index-'));
  try {
    await writeFile(join(stage, 'index.json'), JSON.stringify({ version: 1, seen: Object.fromEntries(entries) }), { mode: 0o600 });
    await rename(join(stage, 'index.json'), destination);
  } finally {
    await rm(stage, { recursive: true, force: true });
  }
}
console.log('Rapport hebdomadaire enregistré dans ' + output + (report.complete ? ' (complet).' : ' (incomplet).'));
