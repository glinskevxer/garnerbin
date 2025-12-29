import { isPlainObject, isString } from '../core/assert.js';
import { assertCommodityId } from '../commodity/registry.js';
import { getFactor } from '../grading/factors.js';
import { bandContaining, normaliseBands, rateFor } from './bands.js';

/**
 * The discount schedule.
 *
 * Every house posts one and no two are the same. A band is a range of readings
 * and the cents a bushel that comes off inside it. Some bands are flat and some
 * step: a cent for every tenth of a point over the line is written as a rate
 * and a step rather than as forty separate rows, which is how the paper
 * schedule reads and how the office keys it.
 *
 * The band checking itself lives in bands.js, because the premium scales and
 * anything else the house posts as a table want exactly the same rules.
 */

export function createDiscountSchedule(input) {
  isPlainObject(input, 'schedule');
  const factors = {};
  for (const [factorId, definition] of Object.entries(isPlainObject(input.factors, 'factors'))) {
    getFactor(factorId);
    factors[factorId] = normaliseBands(definition.bands, factorId);
  }
  return Object.freeze({
    id: isString(input.id, 'id'),
    commodity: assertCommodityId(input.commodity),
    effective: input.effective ?? null,
    factors: Object.freeze(factors),
  });
}

export function bandFor(schedule, factorId, value) {
  const bands = schedule.factors[factorId];
  if (!bands) return null;
  return bandContaining(bands, value);
}

/** Cents a bushel off, in points, for one reading. */
export function discountFor(schedule, factorId, value) {
  const bands = schedule.factors[factorId];
  if (!bands) return 0;
  return rateFor(bands, value);
}

/** Every discount the load earns, with the reading that earned it. */
export function totalDiscount(schedule, readings) {
  isPlainObject(readings, 'readings');
  const lines = [];
  for (const factorId of Object.keys(schedule.factors)) {
    const value = readings[factorId];
    if (typeof value !== 'number') continue;
    const points = discountFor(schedule, factorId, value);
    if (points > 0) lines.push({ factor: factorId, value, points });
  }
  return { lines, totalPoints: lines.reduce((sum, line) => sum + line.points, 0) };
}

export function netPrice(pricePoints, discountPoints) {
  return pricePoints - discountPoints;
}

export function discountedFactors(schedule) {
  return Object.keys(schedule.factors);
}
