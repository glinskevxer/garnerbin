import { InventoryError } from '../core/errors.js';
import { isArray, isPlainObject, nonNegative } from '../core/assert.js';
import { roundHalfUp } from '../core/numbers.js';
import { getFactor } from '../grading/factors.js';
import { determineGrade } from '../grading/grade.js';
import { factorsFor, limitOf } from '../grading/standards.js';

/**
 * Blending.
 *
 * The question is always the same one: how much of the bad bin can go into the
 * good bin and still make the grade. For a factor with a ceiling the answer is
 *
 *     x <= base * (limit - baseValue) / (badValue - limit)
 *
 * and for test weight, where the limit is a floor, the same algebra runs the
 * other way. The binding factor is whichever gives the smallest answer.
 *
 * Weighting by bushels is an approximation for test weight, which does not
 * strictly average. It is the approximation every house uses and it is close
 * enough over the range a blend actually spans, but it is worth knowing that it
 * is an approximation before arguing with a federal grader about it.
 */

export function blendFactor(lots, factorId) {
  isArray(lots, 'lots', { minLength: 1 });
  let bushels = 0;
  let product = 0;
  for (const lot of lots) {
    if (typeof lot.readings[factorId] !== 'number') continue;
    nonNegative(lot.bushels, 'bushels');
    bushels += lot.bushels;
    product += lot.bushels * lot.readings[factorId];
  }
  if (bushels === 0) return null;
  return roundHalfUp(product / bushels, getFactor(factorId).places);
}

export function blendReadings(lots, commodityId) {
  const readings = {};
  for (const factorId of factorsFor(commodityId)) {
    const value = blendFactor(lots, factorId);
    if (value !== null) readings[factorId] = value;
  }
  return readings;
}

export function gradeOfBlend(lots, commodityId) {
  return determineGrade(commodityId, blendReadings(lots, commodityId));
}

/**
 * How many bushels of the addition can go into the base before this one factor
 * runs past its limit. Infinity means the factor never binds.
 */
export function maxBlendIn(base, addition, factorId, limit) {
  isPlainObject(base, 'base');
  isPlainObject(addition, 'addition');
  const factor = getFactor(factorId);
  const baseValue = base.readings[factorId];
  const addValue = addition.readings[factorId];
  if (typeof baseValue !== 'number' || typeof addValue !== 'number') return Infinity;
  const headroom = factor.direction === 'min' ? baseValue - limit : limit - baseValue;
  const shortfall = factor.direction === 'min' ? limit - addValue : addValue - limit;
  if (headroom < 0) return 0;
  if (shortfall <= 0) return Infinity;
  return Math.floor((base.bushels * headroom) / shortfall);
}

/**
 * The blend the house can actually make: the smallest answer across every
 * factor, capped by how much of the addition there is.
 */
export function blendCapacity(base, addition, commodityId, targetGrade) {
  let allowed = Infinity;
  let binding = null;
  for (const factorId of factorsFor(commodityId)) {
    const limit = limitOf(commodityId, targetGrade, factorId);
    const room = maxBlendIn(base, addition, factorId, limit);
    if (room < allowed) {
      allowed = room;
      binding = factorId;
    }
  }
  const bushels = Math.min(allowed, addition.bushels);
  return {
    bushels: Number.isFinite(bushels) ? bushels : addition.bushels,
    unlimited: allowed === Infinity,
    bindingFactor: allowed === Infinity ? null : binding,
  };
}

/** Build the blended lot the capacity says is possible, and grade it. */
export function planBlend(base, addition, commodityId, targetGrade) {
  const capacity = blendCapacity(base, addition, commodityId, targetGrade);
  if (capacity.bushels === 0) {
    throw new InventoryError(
      'NOTHING_WILL_BLEND',
      `no ${addition.id ?? 'addition'} will make US No. ${targetGrade}`,
      {
        commodity: commodityId,
        targetGrade,
        bindingFactor: capacity.bindingFactor,
      }
    );
  }
  const lots = [base, { ...addition, bushels: capacity.bushels }];
  return {
    ...capacity,
    lots,
    readings: blendReadings(lots, commodityId),
    grade: gradeOfBlend(lots, commodityId).grade,
    totalBushels: base.bushels + capacity.bushels,
  };
}
