// Stable, browser-local ordering. Newly introduced stations are appended, old
// stations keep their position, and stale/duplicate names are discarded.
export const stationOrderStorageKey = 'bonnes-ondes.station-order.v1';

export function normalizeStationOrder(stationNames, savedOrder) {
  const available = new Set(stationNames);
  const ordered = [];
  for (const name of Array.isArray(savedOrder) ? savedOrder : []) {
    if (typeof name !== 'string' || !available.has(name) || ordered.includes(name)) continue;
    ordered.push(name);
  }
  return [...ordered, ...stationNames.filter(name => !ordered.includes(name))];
}

export function moveStationBefore(order, dragged, target) {
  if (!Array.isArray(order) || dragged === target || !order.includes(dragged) || !order.includes(target)) {
    return order;
  }
  const result = order.filter(name => name !== dragged);
  result.splice(result.indexOf(target), 0, dragged);
  return result;
}

export function shiftStation(order, name, delta) {
  if (!Array.isArray(order) || ![-1, 1].includes(delta)) return order;
  const from = order.indexOf(name);
  const to = from + delta;
  if (from < 0 || to < 0 || to >= order.length) return order;
  const result = [...order];
  [result[from], result[to]] = [result[to], result[from]];
  return result;
}

/** Keep previous cross-category positions in localStorage but only reorder the
 * visible group. This is important for visitors who arranged cards before the
 * campus/main split.
 */
export function moveStationWithinGroup(order, groupNames, dragged, target) {
  const group = new Set(groupNames);
  if (!group.has(dragged) || !group.has(target)) return order;
  const visible = order.filter(name => group.has(name));
  const next = moveStationBefore(visible, dragged, target);
  let index = 0;
  return order.map(name => group.has(name) ? next[index++] : name);
}

export function shiftStationWithinGroup(order, groupNames, station, delta) {
  const group = new Set(groupNames);
  if (!group.has(station)) return order;
  const visible = order.filter(name => group.has(name));
  const next = shiftStation(visible, station, delta);
  let index = 0;
  return order.map(name => group.has(name) ? next[index++] : name);
}
