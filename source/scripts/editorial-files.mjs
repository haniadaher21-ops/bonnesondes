import { readFileSync } from 'node:fs';

export const publishedFile = new URL('../editorial/editions.json', import.meta.url);
export const readJson = file => JSON.parse(readFileSync(file, 'utf8'));
export const legacyEdition = readJson(new URL('../editorial/legacy.json', import.meta.url));
export const legacyItems = Object.values(readJson(new URL('../editorial/legacy-catalog.json', import.meta.url))).flat();
export { editionItems } from '../editorial/edition.mjs';
