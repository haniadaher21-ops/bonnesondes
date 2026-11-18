import { canonicalUrl } from './edition.mjs';

/**
 * @template {{ id: string, url: string }} T
 * @param {{ startsOn: string, playlists: T[], live: T[] }[]} editions In publication order.
 * @param {{ startsOn: string, playlists: T[], live: T[] }} active
 * @param {'playlists' | 'live'} section
 * @param {T[]} fallback
 * @returns {T[]}
 */
export function editionShelf(editions, active, section, fallback) {
  const earlier = editions.filter(edition => edition.startsOn < active.startsOn).reverse();
  const shelf = new Map();
  for (const item of [...active[section], ...earlier.flatMap(edition => edition[section]), ...fallback]) {
    const first = shelf.get(item.id);
    if (!first) shelf.set(item.id, item);
    else if (canonicalUrl(first.url) === canonicalUrl(item.url)) {
      // Keep the first selection and fill in metadata from the same recommendation.
      shelf.set(item.id, { ...item, ...first });
    }
  }
  return [...shelf.values()];
}
