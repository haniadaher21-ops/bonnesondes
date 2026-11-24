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

/** The Monday of the current week in Europe/Paris, unaffected by DST. */
export function mondayInParis(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now);
  const part = name => Number(parts.find(item => item.type === name)?.value);
  const day = new Date(Date.UTC(part('year'), part('month') - 1, part('day')));
  const offset = (day.getUTCDay() + 6) % 7;
  day.setUTCDate(day.getUTCDate() - offset);
  return day.toISOString().slice(0, 10);
}

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const START_MONDAY = '2026-11-23';
const FIRST_WEEK_IMAGE = 'disco-night';
const PREVIOUS_WEEK_IMAGE = 'dog-dj';

/**
 * Image on the homepage changes every Monday at 00:00 Paris independently
 * of whether a new music edition was published.
 *
 * The bank is append-only. New Drive uploads become eligible the following
 * Monday (availableFromWeek); adding them midweek cannot change a cover
 * already being displayed. All unused photos are shown before repeating.
 */
export function weeklyHomeImageId(now = new Date(), images = imageBank.images) {
  if (!Array.isArray(images) || !images.length) return null;
  const monday = mondayInParis(now);
  const week = Math.floor((Date.parse(monday + 'T00:00:00Z') - Date.parse(START_MONDAY + 'T00:00:00Z')) / WEEK_MS);
  if (week < 0) return images.find(item => item.id === PREVIOUS_WEEK_IMAGE)?.id ?? images[0].id;
  const initial = images.find(item => item.id === FIRST_WEEK_IMAGE);
  const ordered = initial ? [initial, ...images.filter(item => item.id !== FIRST_WEEK_IMAGE)] : images;
  const used = new Set();
  let previous = null;
  let chosen = null;
  for (let n = 0; n <= week; n++) {
    const weekKey = new Date(Date.parse(START_MONDAY + 'T00:00:00Z') + n * WEEK_MS).toISOString().slice(0, 10);
    const available = ordered.filter(item => !item.availableFromWeek || item.availableFromWeek <= weekKey);
    if (!available.length) continue;
    chosen = available.find(item => !used.has(item.id));
    if (!chosen) {
      used.clear();
      chosen = available.find(item => item.id !== previous) ?? available[0];
    }
    used.add(chosen.id);
    previous = chosen.id;
  }
  return chosen?.id ?? ordered[0].id;
}
