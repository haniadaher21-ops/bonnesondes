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
