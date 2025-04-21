import { ConfigError } from '../core/errors.js';
import { isArray, isFiniteNumber, isPlainObject, isString, nonNegative } from '../core/assert.js';
import { roundHalfUp } from '../core/numbers.js';
import { assertCommodityId } from '../commodity/registry.js';
import { getFactor } from '../grading/factors.js';

/**
 * The discount schedule.
 *
 * Every house posts one and no two are the same. A band is a range of readings
 * and the cents a bushel that comes off inside it. Some bands are flat and some
 * step: a cent for every tenth of a point over the line is written as a rate
 * and a step rather than as forty separate rows, which is how the paper
 * schedule reads and how the office keys it.
 *
 * Bands must be contiguous and the last one has to run open ended, because a
 * reading that falls in no band would silently discount nothing.
 */

export function createDiscountSchedule(input) {
  isPlainObject(input, 'schedule');
  const factors = {};
  for (const [factorId, definition] of Object.entries(isPlainObject(input.factors, 'factors'))) {
    getFactor(factorId);
    factors[factorId] = normaliseBands(factorId, definition.bands);
  }
  return Object.freeze({
    id: isString(input.id, 'id'),
    commodity: assertCommodityId(input.commodity),
    effective: input.effective ?? null,
    factors: Object.freeze(factors),
  });
}

function normaliseBands(factorId, bands) {
  isArray(bands, 'bands', { minLength: 1 });
  const normalised = bands.map((band, index) => {
    isPlainObject(band, 'band');
    const from = isFiniteNumber(band.from, 'from');
    const to = band.to === null || band.to === undefined ? null : isFiniteNumber(band.to, 'to');
    if (to !== null && to <= from) {
      throw new ConfigError(
        'BAND_INVERTED',
        `${factorId} band ${index} ends at or before it starts`,
        {
          factor: factorId,
          index,
        }
      );
    }
    const entry = { from, to };
    if (band.pointsPerUnit !== undefined) {
      entry.pointsPerUnit = nonNegative(band.pointsPerUnit, 'pointsPerUnit');
      entry.step = band.step ?? 1;
      if (entry.step <= 0) {
        throw new ConfigError('BAD_STEP', `${factorId} band ${index} has a step of ${entry.step}`, {
          factor: factorId,
          index,
        });
      }
    } else {
      entry.points = nonNegative(band.points ?? 0, 'points');
    }
    return Object.freeze(entry);
  });
  for (let index = 1; index < normalised.length; index += 1) {
    if (normalised[index - 1].to !== normalised[index].from) {
      throw new ConfigError('BANDS_NOT_CONTIGUOUS', `${factorId} has a hole before band ${index}`, {
        factor: factorId,
        index,
      });
    }
  }
  if (normalised[normalised.length - 1].to !== null) {
    throw new ConfigError('BANDS_NOT_OPEN', `${factorId} does not cover its worst readings`, {
      factor: factorId,
    });
  }
  return Object.freeze(normalised);
}

export function bandFor(schedule, factorId, value) {
  const bands = schedule.factors[factorId];
  if (!bands) return null;
  isFiniteNumber(value, factorId);
  return bands.find((band) => value >= band.from && (band.to === null || value < band.to)) ?? null;
}

/** Cents a bushel off, in points, for one reading. */
export function discountFor(schedule, factorId, value) {
  const band = bandFor(schedule, factorId, value);
  if (band === null) return 0;
  if (band.points !== undefined) return band.points;
  const over = Math.max(0, value - band.from);
  const steps = Math.ceil(roundHalfUp(over / band.step, 6));
  return roundHalfUp(steps * band.pointsPerUnit, 4);
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
