import { GradeError } from '../core/errors.js';
import { isPlainObject, nonNegative, positive } from '../core/assert.js';
import { roundHalfUp, truncate } from '../core/numbers.js';
import { bushelsFromDecimal, bushelsToDecimal } from '../core/money.js';

/**
 * Dockage.
 *
 * The Carter tester puts the sample over a riddle and a pair of sieves and
 * pulls the light stuff off with an aspirator. What comes out is dockage: weed
 * seed, chaff, stems, dirt, anything that is not wheat and that will come out
 * with ordinary cleaning.
 *
 * It matters twice. The grade is read on the cleaned sample, so dockage is out
 * of the picture by the time the factors are measured, and the grower is paid
 * on the clean bushels, so it comes off the settlement weight as well.
 */

export const REPORTABLE_THRESHOLD = 0.05;

export function computeDockage(pan) {
  isPlainObject(pan, 'pan');
  const sampleGrams = positive(pan.sampleGrams, 'sampleGrams');
  const parts = ['siftings', 'large', 'aspirated', 'handpicked'];
  let grams = 0;
  for (const part of parts) {
    grams += nonNegative(pan[`${part}Grams`] ?? 0, `${part}Grams`);
  }
  if (grams > sampleGrams) {
    throw new GradeError(
      'DOCKAGE_OVER_SAMPLE',
      `${grams} g of dockage in a ${sampleGrams} g sample`,
      {
        grams,
        sampleGrams,
      }
    );
  }
  const raw = (grams / sampleGrams) * 100;
  return {
    grams: roundHalfUp(grams, 2),
    percent: reportedDockage(raw),
    cleanGrams: roundHalfUp(sampleGrams - grams, 2),
  };
}

/** Dockage prints in whole and tenth percent, and anything under a twentieth reads zero. */
export function reportedDockage(percent) {
  nonNegative(percent, 'percent');
  return percent < REPORTABLE_THRESHOLD ? 0 : roundHalfUp(percent, 1);
}

export function isReportable(percent) {
  return reportedDockage(percent) > 0;
}

export function cleanPercent(percent) {
  return roundHalfUp(100 - reportedDockage(percent), 1);
}

/**
 * Take the dockage off a load. The dockage bushels are kept rather than thrown
 * away because the house sells the screenings and the position report has to
 * account for them.
 */
export function applyDockage(bushelHundredths, percent) {
  const reported = reportedDockage(percent);
  const gross = bushelsToDecimal(bushelHundredths);
  const dockageBushels = bushelsFromDecimal(truncate((gross * reported) / 100, 2));
  return {
    grossBushels: bushelHundredths,
    dockagePercent: reported,
    dockageBushels,
    netBushels: bushelHundredths - dockageBushels,
  };
}

/** The same cut, in pounds, for the scale ticket. */
export function dockagePounds(netPounds, percent) {
  nonNegative(netPounds, 'netPounds');
  return roundHalfUp((netPounds * reportedDockage(percent)) / 100, 0);
}

/**
 * Grade factors are read on the cleaned sample. A reading taken on the whole
 * sample has to be lifted onto the clean basis before it goes near the tables.
 */
export function onCleanBasis(percentOfWholeSample, dockagePercent) {
  nonNegative(percentOfWholeSample, 'percentOfWholeSample');
  const clean = cleanPercent(dockagePercent);
  if (clean === 0) {
    throw new GradeError('NOTHING_LEFT', 'the sample is all dockage', { dockagePercent });
  }
  return roundHalfUp((percentOfWholeSample / clean) * 100, 2);
}
