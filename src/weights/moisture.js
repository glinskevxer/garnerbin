import { TicketError } from '../core/errors.js';
import { inRange, isArray, nonNegative } from '../core/assert.js';
import { roundHalfUp } from '../core/numbers.js';
import { assertCommodityId } from '../commodity/registry.js';

/**
 * Moisture, as the meter reads it and as the office has to record it.
 *
 * A capacitance meter is reading the dielectric of the whole sample, so it is
 * sensitive to how cold the grain is. The correction table below is the one
 * taped to the side of the meter in the probe shack: nothing between forty and
 * ninety degrees, and a tenth of a point for every ten degrees outside that.
 *
 * The meter also has a ceiling. Corn over the ceiling has to be dried down and
 * read again, and the office is required to say so rather than record a number
 * the meter cannot stand behind.
 */

const METER_CEILING = {
  corn: 35,
  soybeans: 25,
  hrw: 25,
  srw: 25,
  sorghum: 30,
};

export const AIR_OVEN_TOLERANCE = 0.5;
export const COMFORTABLE_LOW = 40;
export const COMFORTABLE_HIGH = 90;

/** How much to add to the reading for grain that is colder or hotter than the meter likes. */
export function temperatureCorrection(grainTempF) {
  inRange(grainTempF, 'grainTempF', -20, 140);
  if (grainTempF >= COMFORTABLE_LOW && grainTempF <= COMFORTABLE_HIGH) return 0;
  const distance =
    grainTempF < COMFORTABLE_LOW ? COMFORTABLE_LOW - grainTempF : grainTempF - COMFORTABLE_HIGH;
  const tenths = Math.ceil(distance / 10) / 10;
  return grainTempF < COMFORTABLE_LOW ? roundHalfUp(tenths, 2) : roundHalfUp(-tenths, 2);
}

export function correctedMoisture(commodityId, reading, { grainTempF, meterBias = 0 } = {}) {
  assertCommodityId(commodityId);
  inRange(reading, 'reading', 0, 45);
  const correction = grainTempF === undefined ? 0 : temperatureCorrection(grainTempF);
  return roundHalfUp(reading + correction + meterBias, 1);
}

export function meterCeiling(commodityId) {
  return METER_CEILING[assertCommodityId(commodityId)];
}

export function overMeterCeiling(commodityId, reading) {
  return reading > meterCeiling(commodityId);
}

/**
 * Refuse a reading the meter cannot stand behind. A wet load is not a problem;
 * a wet load recorded as if the meter were sure of it is.
 */
export function assertReadable(commodityId, reading) {
  if (overMeterCeiling(commodityId, reading)) {
    throw new TicketError(
      'OVER_METER_CEILING',
      `${reading} percent is over the ${commodityId} meter ceiling of ${meterCeiling(commodityId)}`,
      { commodity: commodityId, reading, ceiling: meterCeiling(commodityId) }
    );
  }
  return reading;
}

/** The daily check against the air oven. Half a point of disagreement is the line. */
export function meterCheck({ meterReading, ovenReading }) {
  inRange(meterReading, 'meterReading', 0, 45);
  inRange(ovenReading, 'ovenReading', 0, 45);
  const difference = roundHalfUp(meterReading - ovenReading, 2);
  return {
    difference,
    withinTolerance: Math.abs(difference) <= AIR_OVEN_TOLERANCE,
    suggestedBias: roundHalfUp(-difference, 1),
  };
}

/**
 * The house average moisture, weighted by the bushels behind each reading. A
 * straight average of the tickets is the mistake that puts a bin two points off
 * what the aeration plan assumed.
 */
export function weightedMoisture(entries) {
  isArray(entries, 'entries', { minLength: 1 });
  let bushels = 0;
  let product = 0;
  for (const entry of entries) {
    const weight = nonNegative(entry.bushels, 'bushels');
    inRange(entry.moisture, 'moisture', 0, 45);
    bushels += weight;
    product += weight * entry.moisture;
  }
  if (bushels === 0) return 0;
  return roundHalfUp(product / bushels, 1);
}

/** Water in the load, in pounds, which is what the dryer actually has to move. */
export function waterPounds(netPounds, moisture) {
  nonNegative(netPounds, 'netPounds');
  inRange(moisture, 'moisture', 0, 45);
  return roundHalfUp((netPounds * moisture) / 100, 0);
}
