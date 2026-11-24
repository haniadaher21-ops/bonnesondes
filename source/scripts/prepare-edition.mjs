import { open, rename, unlink } from 'node:fs/promises';
import { validateEdition } from '../editorial/edition.mjs';
import { nextEditionImageId } from '../editorial/edition-art.mjs';
import { legacyEdition, legacyItems, publishedFile, readJson } from './editorial-files.mjs';

const [file, approval, ...extra] = process.argv.slice(2);
if (!file || (approval && approval !== '--approve') || extra.length) {
  console.error('Utilisation : npm run edition -- <selection.json> [--approve]');
  process.exit(1);
}

const temporary = new URL('editions.json.tmp', publishedFile);
let pending;
try {
  if (approval === '--approve') pending = await open(temporary, 'wx');
  const published = readJson(publishedFile);
  const candidate = readJson(file);
  // Manual approvals follow the same image rotation as automatic publication.
  const draft = { ...candidate, coverImageId: candidate.coverImageId ?? nextEditionImageId([legacyEdition,...published]) };
  const earlier = [legacyEdition];
  for (const edition of [...published, draft]) {
    const errors = validateEdition(edition, earlier, legacyItems);
    if (errors.length) throw new Error(errors.join('\n'));
    earlier.push(edition);
  }
  if (pending) {
    await pending.writeFile(JSON.stringify([...published, draft], null, 2) + '\n');
    await pending.close();
    await rename(temporary, publishedFile);
    pending = undefined;
    console.log('Édition ' + draft.number + ' ajoutée aux données du site. Aucun déploiement lancé.');
  } else {
    console.log('Édition ' + draft.number + ' valide. Relire la sélection, puis relancer avec --approve.');
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  if (pending) {
    await pending.close();
    await unlink(temporary);
  }
}
