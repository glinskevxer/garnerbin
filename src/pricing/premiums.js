import { ConfigError } from '../core/errors.js';
import { isPlainObject, isString, nonNegative, positive } from '../core/assert.js';
import { roundHalfUp, truncate } from '../core/numbers.js';
import { assertCommodityId } from '../commodity/registry.js';
import { getFactor } from '../grading/factors.js';

/**
 * Premium scales.
 *
 * A discount schedule is a set of bands. A premium scale is not: it is a base
 * reading, a step, and a rate for each step above it, usually with a ceiling
 * where the buyer stops paying. Protein on hard red winter is the one that
 * matters, at three cents a quarter point over eleven, and the mirror of it
 * below the base is a discount rather than a premium.
 *
 * The scale runs both ways from the base by default. A buyer who pays for good
 * wheat but does not penalise ordinary wheat sets belowBase to zero and gets
 * exactly that.
 */

export function createPremiumSchedule(input) {
  isPlainObject(input, 'schedule');
  const scales = {};
  for (const [factorId, scale] of Object.entries(isPlainObject(input.scales, 'scales'))) {
    const factor = getFactor(factorId);
    const step = positive(scale.step ?? 0.25, 'step');
    const above = nonNegative(scale.abovePoints ?? 0, 'abovePoints');
    const below =
      scale.belowPoints === undefined ? above : nonNegative(scale.belowPoints, 'belowPoints');
    if (scale.ceiling !== undefined && scale.ceiling < scale.base) {
      throw new ConfigError('CEILING_UNDER_BASE', `${factorId} has a ceiling under its base`, {
        factor: factorId,
      });
    }
    if (scale.floor !== undefined && scale.floor > scale.base) {
      throw new ConfigError('FLOOR_OVER_BASE', `${factorId} has a floor over its base`, {
        factor: factorId,
      });
    }
    scales[factorId] = Object.freeze({
      factor: factorId,
      direction: factor.direction,
      base: scale.base,
      step,
      abovePoints: above,
      belowPoints: below,
      ceiling: scale.ceiling ?? null,
      floor: scale.floor ?? null,
    });
  }
  if (Object.keys(scales).length === 0) {
    throw new ConfigError('EMPTY_SCHEDULE', 'a premium schedule needs at least one scale', {});
  }
  return Object.freeze({
    id: isString(input.id, 'id'),
    commodity: assertCommodityId(input.commodity),
    scales: Object.freeze(scales),
  });
}

/**
 * Whole steps only. A buyer paying by the quarter point does not pay for a
 * tenth of one, so the reading is truncated toward the base rather than
 * rounded, in the buyer's favour on both sides.
 */
export function stepsFrom(scale, value) {
  const clamped = clampToScale(scale, value);
  const distance = clamped - scale.base;
  const steps = Math.floor(truncate(Math.abs(distance) / scale.step, 6));
  if (steps === 0) return 0;
  return distance < 0 ? -steps : steps;
}

function clampToScale(scale, value) {
  let clamped = value;
  if (scale.ceiling !== null) clamped = Math.min(clamped, scale.ceiling);
  if (scale.floor !== null) clamped = Math.max(clamped, scale.floor);
  return clamped;
}

/** Points a bushel, positive for a premium and negative for the discount below base. */
export function premiumFor(schedule, factorId, value) {
  const scale = schedule.scales[factorId];
  if (!scale) return 0;
  const steps = stepsFrom(scale, value);
  if (steps === 0) return 0;
  const rate = steps > 0 ? scale.abovePoints : scale.belowPoints;
  return roundHalfUp(steps * rate, 4);
}

export function totalPremium(schedule, readings) {
  isPlainObject(readings, 'readings');
  const lines = [];
  for (const factorId of Object.keys(schedule.scales)) {
    const value = readings[factorId];
    if (typeof value !== 'number') continue;
    const points = premiumFor(schedule, factorId, value);
    if (points !== 0) {
      lines.push({
        factor: factorId,
        value,
        steps: stepsFrom(schedule.scales[factorId], value),
        points,
      });
    }
  }
  return { lines, totalPoints: lines.reduce((sum, line) => sum + line.points, 0) };
}

export function withPremiums(pricePoints, premiumPoints) {
  return pricePoints + premiumPoints;
}

export function scaledFactors(schedule) {
  return Object.keys(schedule.scales);
}

/** What the scale would pay across a run of readings, for a bid sheet. */
export function scaleTable(schedule, factorId, from, to) {
  const scale = schedule.scales[factorId];
  if (!scale) {
    throw new ConfigError('NO_SUCH_SCALE', `${schedule.id} has no scale for ${factorId}`, {
      factor: factorId,
    });
  }
  const rows = [];
  for (let value = from; value <= to + 1e-9; value = roundHalfUp(value + scale.step, 4)) {
    rows.push({ value: roundHalfUp(value, 4), points: premiumFor(schedule, factorId, value) });
  }
  return rows;
}
