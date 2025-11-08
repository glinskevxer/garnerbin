import { GradeError } from '../core/errors.js';
import { inRange, isPlainObject, oneOf } from '../core/assert.js';
import { roundHalfUp } from '../core/numbers.js';

/**
 * The wheat quality readings that are not grade factors.
 *
 * None of these change the numeric grade. All of them change what the load is
 * worth, and two of them decide whether it can be sold at all.
 *
 * Protein is quoted on a twelve percent moisture basis, always, because a wet
 * sample reads low and a dry one reads high on the same wheat. Converting is
 * two lines of arithmetic and forgetting to do it is worth a nickel a bushel.
 *
 * Falling number is a sprout damage test: the time in seconds for a stirrer to
 * fall through a hot slurry. Sound wheat runs over three hundred. Under two
 * hundred and fifty the starch is already broken down and a miller will not
 * take it at any price.
 */

export const PROTEIN_BASIS_MOISTURE = 12;
export const SOUND_FALLING_NUMBER = 300;

/** Convert a protein reading from the moisture it was taken at onto the twelve basis. */
export function proteinOnBasis(asIsPercent, moisturePercent) {
  inRange(asIsPercent, 'asIsPercent', 0, 30);
  inRange(moisturePercent, 'moisturePercent', 0, 45);
  const dry = 100 - moisturePercent;
  if (dry <= 0) {
    throw new GradeError('NO_DRY_MATTER', 'a sample cannot be all water', { moisturePercent });
  }
  return roundHalfUp((asIsPercent * (100 - PROTEIN_BASIS_MOISTURE)) / dry, 2);
}

/** And back again, for a buyer who wants it as received. */
export function proteinAsIs(basisPercent, moisturePercent) {
  inRange(basisPercent, 'basisPercent', 0, 30);
  inRange(moisturePercent, 'moisturePercent', 0, 45);
  return roundHalfUp((basisPercent * (100 - moisturePercent)) / (100 - PROTEIN_BASIS_MOISTURE), 2);
}

const SPROUT_BANDS = [
  { through: null, from: 300, label: 'sound' },
  { through: 300, from: 250, label: 'marginal' },
  { through: 250, from: 200, label: 'sprouted' },
  { through: 200, from: 0, label: 'badly sprouted' },
];

export function sproutCondition(fallingNumber) {
  inRange(fallingNumber, 'fallingNumber', 0, 600);
  return SPROUT_BANDS.find(
    (band) => fallingNumber >= band.from && (band.through === null || fallingNumber < band.through)
  ).label;
}

export function isMillable(fallingNumber) {
  return fallingNumber >= 250;
}

/**
 * Vomitoxin limits. The advisory levels differ by what the grain is going to be
 * eaten by, and the same load can be fine for cattle and refused by a mill.
 */
export const DON_LIMITS = Object.freeze({
  human: 1,
  swine: 5,
  dairy: 5,
  cattle: 10,
  poultry: 10,
});

export const DON_USES = Object.freeze(Object.keys(DON_LIMITS));

export function donLimitFor(use) {
  oneOf(use, 'use', DON_USES);
  return DON_LIMITS[use];
}

export function donAcceptable(ppm, use) {
  inRange(ppm, 'ppm', 0, 100);
  return roundHalfUp(ppm, 1) <= donLimitFor(use);
}

/** Which markets a load with this reading can still go to. */
export function marketsOpenTo(ppm) {
  return DON_USES.filter((use) => donAcceptable(ppm, use));
}

/** Everything the mill asks about a wheat load, in one answer. */
export function millingReport(sample) {
  isPlainObject(sample, 'sample');
  const moisture = sample.moisture ?? PROTEIN_BASIS_MOISTURE;
  const report = {
    protein: null,
    proteinAsIs: null,
    fallingNumber: null,
    sprout: null,
    millable: true,
    don: null,
    markets: DON_USES,
  };
  if (typeof sample.protein === 'number') {
    report.protein = proteinOnBasis(sample.protein, moisture);
    report.proteinAsIs = sample.protein;
  }
  if (typeof sample.fallingNumber === 'number') {
    report.fallingNumber = sample.fallingNumber;
    report.sprout = sproutCondition(sample.fallingNumber);
    report.millable = isMillable(sample.fallingNumber);
  }
  if (typeof sample.don === 'number') {
    report.don = sample.don;
    report.markets = marketsOpenTo(sample.don);
    if (!report.markets.includes('human')) report.millable = false;
  }
  return report;
}
