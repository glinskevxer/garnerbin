import { ConfigError } from '../core/errors.js';
import { inRange, isPlainObject, positive } from '../core/assert.js';
import { roundHalfUp } from '../core/numbers.js';
import { assertCommodityId, getCommodity } from '../commodity/registry.js';

/**
 * Aeration.
 *
 * Grain in a bin comes to equilibrium with the air moving through it. The
 * equilibrium moisture content for a temperature and a humidity is the modified
 * Henderson equation, and the constants below are the published ones for yellow
 * dent corn, hard red winter wheat and soybeans.
 *
 * The practical use is one decision, made at the fan switch and made wrong all
 * the time: running the fan on a warm humid night rewets the bottom of the bin
 * and the operator does not find out until the grain crusts in March.
 */

const HENDERSON = {
  corn: { k: 8.6541e-5, n: 1.8634, c: 49.81 },
  hrw: { k: 2.3007e-5, n: 2.2857, c: 55.815 },
  srw: { k: 2.3007e-5, n: 2.2857, c: 55.815 },
  soybeans: { k: 30.5327e-5, n: 1.2164, c: 134.136 },
  sorghum: { k: 0.86e-4, n: 1.8634, c: 49.81 },
};

/** Equilibrium moisture content, in percent, at this air temperature and humidity. */
export function equilibriumMoisture(commodityId, tempF, relativeHumidity) {
  const commodity = assertCommodityId(commodityId);
  inRange(tempF, 'tempF', -20, 140);
  inRange(relativeHumidity, 'relativeHumidity', 0.01, 0.99);
  const constants = HENDERSON[commodity];
  const me = Math.pow(
    -Math.log(1 - relativeHumidity) / (constants.k * (tempF + constants.c)),
    1 / constants.n
  );
  return roundHalfUp(me, 1);
}

/** The humidity that would hold grain at this moisture, which is the other question. */
export function humidityFor(commodityId, tempF, moisture) {
  const commodity = assertCommodityId(commodityId);
  inRange(tempF, 'tempF', -20, 140);
  positive(moisture, 'moisture');
  const constants = HENDERSON[commodity];
  const rh = 1 - Math.exp(-constants.k * (tempF + constants.c) * Math.pow(moisture, constants.n));
  return roundHalfUp(rh, 3);
}

export const COOLING_TARGET_F = 40;
export const COOLING_STEP_F = 10;

/**
 * Whether to run the fan.
 *
 * Cooling is the first job: bring the grain down in ten degree steps until it
 * sits near forty. Drying is the second, and only when the air will actually
 * take moisture out, which is when the equilibrium moisture is under what is in
 * the bin. Air that would put moisture back is the one case where running the
 * fan is worse than doing nothing.
 */
export function aerationAdvice(input) {
  isPlainObject(input, 'conditions');
  const commodity = assertCommodityId(input.commodity);
  const grainMoisture = inRange(input.grainMoisture, 'grainMoisture', 0, 45);
  const grainTempF = inRange(input.grainTempF, 'grainTempF', -20, 140);
  const airTempF = inRange(input.airTempF, 'airTempF', -20, 140);
  const emc = equilibriumMoisture(commodity, airTempF, input.relativeHumidity);
  const target = input.targetTempF ?? COOLING_TARGET_F;

  if (emc > grainMoisture + 0.5) {
    return {
      run: false,
      emc,
      reason: `the air sits at ${emc} percent and would put moisture back in`,
    };
  }
  if (grainTempF > target && airTempF <= grainTempF - COOLING_STEP_F) {
    return { run: true, emc, reason: `cooling from ${grainTempF} toward ${target}` };
  }
  if (grainMoisture > getCommodity(commodity).safeMoisture && emc < grainMoisture - 1) {
    return { run: true, emc, reason: `drying toward ${emc} percent` };
  }
  if (grainTempF > target) {
    return { run: false, emc, reason: 'the air is not cold enough to move the front' };
  }
  return { run: false, emc, reason: 'the bin is already where it should be' };
}

/**
 * Allowable storage time, in days, before the grain has used up half a percent
 * of its dry matter. It halves for every five points of moisture and roughly
 * halves again for every twenty degrees of temperature.
 */
export function allowableStorageDays(commodityId, moisture, grainTempF) {
  assertCommodityId(commodityId);
  inRange(moisture, 'moisture', 10, 45);
  inRange(grainTempF, 'grainTempF', 20, 120);
  const base = 232;
  const moistureFactor = Math.pow(0.5, (moisture - 15) / 2.5);
  const temperatureFactor = Math.pow(0.5, (grainTempF - 40) / 20);
  const days = base * moistureFactor * temperatureFactor;
  if (!Number.isFinite(days)) {
    throw new ConfigError('NO_STORAGE_LIFE', 'the storage life works out to nothing usable', {
      moisture,
      grainTempF,
    });
  }
  return roundHalfUp(days, 0);
}

/** Hours for a cooling front to move through, at this fan rate. */
export function frontHours(cfmPerBushel) {
  positive(cfmPerBushel, 'cfmPerBushel');
  return roundHalfUp(1.5 / cfmPerBushel, 1);
}

export function coolingPlan(commodityId, fromTempF, { targetTempF = COOLING_TARGET_F } = {}) {
  assertCommodityId(commodityId);
  inRange(fromTempF, 'fromTempF', -20, 140);
  const steps = [];
  let current = fromTempF;
  while (current - COOLING_STEP_F >= targetTempF) {
    current -= COOLING_STEP_F;
    steps.push(current);
  }
  if (steps.length === 0 || steps.at(-1) !== targetTempF) steps.push(targetTempF);
  return steps.filter((step) => step <= fromTempF);
}
