import { ArithmeticError } from '../core/errors.js';
import { inRange, nonNegative, positive } from '../core/assert.js';
import { roundHalfUp, truncate } from '../core/numbers.js';
import { bushelsFromDecimal, bushelsToDecimal } from '../core/money.js';
import { marketMoisture } from '../commodity/registry.js';

/**
 * Shrink.
 *
 * Two different things go by that name and mixing them up is the single most
 * expensive arithmetic mistake this office can make.
 *
 * Water shrink is physics. Take corn from twenty points to fifteen and the
 * water that leaves is (M1 - M2) / (100 - M2) of the starting weight. Nobody
 * negotiates it.
 *
 * The shrink factor is commercial. It is a percent of weight taken per point of
 * moisture removed, and the house sets it. At fifteen percent the water alone
 * works out near 1.18 per point, so a factor of 1.4 is 1.18 of water and the
 * rest is the handling loss the house expects to eat between the pit and the
 * railcar.
 */

export const DEFAULT_SHRINK_FACTOR = 1.4;

export function waterShrinkPercent(from, to) {
  inRange(from, 'from', 0, 45);
  inRange(to, 'to', 0, 45);
  if (to >= 100) {
    throw new ArithmeticError('BAD_TARGET_MOISTURE', 'the target moisture must be under 100', {
      to,
    });
  }
  if (from <= to) return 0;
  return roundHalfUp(((from - to) / (100 - to)) * 100, 4);
}

/** The per point factor the physics alone implies at this target. */
export function impliedWaterFactor(from, to) {
  if (from <= to) return 0;
  return roundHalfUp(waterShrinkPercent(from, to) / (from - to), 4);
}

export function pointsRemoved(from, to) {
  inRange(from, 'from', 0, 45);
  inRange(to, 'to', 0, 45);
  return from <= to ? 0 : roundHalfUp(from - to, 1);
}

/**
 * The commercial shrink the house actually deducts. Dry grain shrinks nothing:
 * a load under the market moisture is not worth more bushels than it weighs.
 */
export function shrinkPercent({ from, to, factor = DEFAULT_SHRINK_FACTOR }) {
  positive(factor, 'factor');
  const points = pointsRemoved(from, to);
  return roundHalfUp(points * factor, 4);
}

export function shrinkPercentFor(commodityId, moisture, factor = DEFAULT_SHRINK_FACTOR) {
  return shrinkPercent({ from: moisture, to: marketMoisture(commodityId), factor });
}

/** Split a load into what the grower is paid for and what the shrink took. */
export function applyShrink(bushelHundredths, percent) {
  nonNegative(percent, 'percent');
  const gross = bushelsToDecimal(bushelHundredths);
  const shrinkBushels = bushelsFromDecimal(truncate((gross * percent) / 100, 2));
  return {
    grossBushels: bushelHundredths,
    shrinkPercent: roundHalfUp(percent, 4),
    shrinkBushels,
    netBushels: bushelHundredths - shrinkBushels,
  };
}

export function shrinkPounds(netPounds, percent) {
  nonNegative(netPounds, 'netPounds');
  nonNegative(percent, 'percent');
  return roundHalfUp((netPounds * percent) / 100, 0);
}

/**
 * What the load weighs once it is down to the target moisture, on water alone.
 * This is the number the dryer operator checks his own scale against.
 */
export function dryWeight(wetPounds, from, to) {
  nonNegative(wetPounds, 'wetPounds');
  inRange(from, 'from', 0, 45);
  inRange(to, 'to', 0, 45);
  if (from <= to) return roundHalfUp(wetPounds, 0);
  return roundHalfUp((wetPounds * (100 - from)) / (100 - to), 0);
}

/**
 * The whole deduction, water plus whatever handling percent the house adds on
 * top of the factor, reported so the settlement sheet can show both lines.
 */
export function totalShrink({ from, to, factor = DEFAULT_SHRINK_FACTOR, handlingPercent = 0 }) {
  nonNegative(handlingPercent, 'handlingPercent');
  const moisture = shrinkPercent({ from, to, factor });
  return {
    points: pointsRemoved(from, to),
    factor,
    moisturePercent: moisture,
    handlingPercent: roundHalfUp(handlingPercent, 4),
    totalPercent: roundHalfUp(moisture + handlingPercent, 4),
  };
}
