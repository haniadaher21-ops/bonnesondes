import { spawnSync } from 'node:child_process';
import { constants, cpSync, mkdirSync, mkdtempSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const source = fileURLToPath(new URL('../', import.meta.url));
const staging = mkdtempSync(join(tmpdir(), 'bonnes-ondes-preview-'));
const destination = join(source, '.preview/bonnesondes/preview-002');

try {
  for (const path of [
    'app', 'editorial', 'public', 'next.config.ts', 'package.json',
    'tsconfig.json', 'postcss.config.mjs', 'node_modules',
  ]) {
    cpSync(join(source, path), join(staging, path), { recursive: true, verbatimSymlinks: true, mode: constants.COPYFILE_FICLONE });
  }
  cpSync(join(source, 'scripts/preview-002-page.tsx'), join(staging, 'app/page.tsx'));
  renameSync(join(staging, 'next.config.ts'), join(staging, 'next.base.config.ts'));
  writeFileSync(join(staging, 'next.config.ts'), [
    "import config from './next.base.config';",
    "export default { ...config, basePath: '/bonnesondes/preview-002' };",
    '',
  ].join('\n'));

  const result = spawnSync(process.execPath, ['node_modules/next/dist/bin/next', 'build'], {
    cwd: staging, stdio: 'inherit',
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error('Échec de la compilation de l’aperçu.');

  rmSync(destination, { recursive: true, force: true });
  mkdirSync(destination, { recursive: true });
  cpSync(join(staging, 'out'), destination, { recursive: true });
  console.log('Aperçu compilé dans .preview/bonnesondes/preview-002/.');
} finally {
  rmSync(staging, { recursive: true, force: true });
}
