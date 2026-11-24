import imageBank from './image-bank.json' with { type: 'json' };

export function editionImage(coverImageId) {
  if (typeof coverImageId !== 'string') return null;
  return imageBank.images.find(item => item.id === coverImageId) ?? null;
}

/**
 * Stable automatic allocation. A new image is used once before any repeats.
 * Existing edition cover IDs are stored inside the edition's published JSON,
 * so adding a new Drive photo to the bank never modifies old archives.
 * When the whole bank has been used, start a new rotation without repeating
 * the cover of the immediately preceding edition (if there is an alternative).
 */
export function nextEditionImageId(earlier, images = imageBank.images) {
  if (!Array.isArray(images) || !images.length) throw new Error('Banque d’illustrations vide.');
  const ids = new Set(images.map(item => item.id));
  const used = new Set((earlier ?? []).map(item => item?.coverImageId).filter(id => ids.has(id)));
  const firstUnused = images.find(item => !used.has(item.id));
  if (firstUnused) return firstUnused.id;
  const previous = earlier?.at(-1)?.coverImageId;
  const index = images.findIndex(item => item.id === previous);
  return images[(index + 1) % images.length].id;
}

export function editionImagePath(coverImageId) {
  return editionImage(coverImageId)?.file ?? null;
}
