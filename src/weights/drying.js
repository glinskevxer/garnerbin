import { ConfigError } from '../core/errors.js';
import { isArray, isPlainObject, nonNegative, oneOf } from '../core/assert.js';
import { roundHalfUp } from '../core/numbers.js';
import { chargePerBushel } from '../core/money.js';
import { marketMoisture } from '../commodity/registry.js';
import { pointsRemoved } from './shrink.js';

/**
 * What the house charges to run a wet load through the dryer.
 *
 * Drying is billed on the points taken out, per bushel, and every house rounds
 * those points its own way. Rounding to the whole point up is the common one
 * and it is worth two or three cents a bushel on a load that came in at 18.1,
 * so the rounding rule is part of the schedule and not a detail of the code.
 *
 * Tiers exist because the last points off a very wet load cost more fuel than
 * the first ones.
 */

const ROUNDING = ['tenth', 'half', 'whole'];

export function createDryingSchedule(input) {
  isPlainObject(input, 'schedule');
  const rounding = oneOf(input.rounding ?? 'tenth', 'rounding', ROUNDING);
  const tiers = normaliseTiers(
    input.tiers ?? [{ throughPoint: null, ratePoints: input.ratePoints }]
  );
  return Object.freeze({
    id: input.id ?? 'drying',
    rounding,
    freePoints: nonNegative(input.freePoints ?? 0, 'freePoints'),
    minimumChargePoints: nonNegative(input.minimumChargePoints ?? 0, 'minimumChargePoints'),
    tiers,
  });
}

function normaliseTiers(tiers) {
  isArray(tiers, 'tiers', { minLength: 1 });
  let previous = 0;
  const normalised = tiers.map((tier, index) => {
    isPlainObject(tier, 'tier');
    nonNegative(tier.ratePoints, 'ratePoints');
    const through = tier.throughPoint ?? null;
    if (through !== null) {
      nonNegative(through, 'throughPoint');
      if (through <= previous) {
        throw new ConfigError(
          'TIERS_OUT_OF_ORDER',
          `tier ${index} ends at or before the one before`,
          {
            index,
            throughPoint: through,
            previous,
          }
        );
      }
      previous = through;
    } else if (index !== tiers.length - 1) {
      throw new ConfigError('OPEN_TIER_NOT_LAST', 'only the last tier may run open ended', {
        index,
      });
    }
    return Object.freeze({ throughPoint: through, ratePoints: tier.ratePoints });
  });
  return Object.freeze(normalised);
}

/** Round the points the way the schedule says before any money is worked out. */
export function roundPoints(points, rounding) {
  nonNegative(points, 'points');
  if (rounding === 'whole') return Math.ceil(roundHalfUp(points, 1));
  if (rounding === 'half') return roundHalfUp(Math.ceil(roundHalfUp(points, 1) * 2) / 2, 1);
  return roundHalfUp(points, 1);
}

export function chargeablePoints(schedule, commodityId, moisture) {
  const raw = pointsRemoved(moisture, marketMoisture(commodityId));
  const afterFree = Math.max(0, roundHalfUp(raw - schedule.freePoints, 1));
  return roundPoints(afterFree, schedule.rounding);
}

/** Walk the tiers and add up the rate for each point band the load lands in. */
export function ratePointsFor(schedule, points) {
  nonNegative(points, 'points');
  let remaining = points;
  let floor = 0;
  let total = 0;
  for (const tier of schedule.tiers) {
    if (remaining <= 0) break;
    const ceiling = tier.throughPoint === null ? Infinity : tier.throughPoint;
    const band = Math.min(remaining, ceiling - floor);
    total += band * tier.ratePoints;
    remaining = roundHalfUp(remaining - band, 4);
    floor = ceiling;
  }
  return roundHalfUp(total, 4);
}

export function dryingCharge(schedule, { commodity, moisture, bushelHundredths }) {
  const points = chargeablePoints(schedule, commodity, moisture);
  const rate = ratePointsFor(schedule, points);
  const cents = chargePerBushel(Math.round(rate), bushelHundredths);
  const minimum = chargePerBushel(Math.round(schedule.minimumChargePoints), bushelHundredths);
  return {
    points,
    ratePoints: roundHalfUp(rate, 2),
    cents: points === 0 ? 0 : Math.max(cents, minimum),
  };
}
