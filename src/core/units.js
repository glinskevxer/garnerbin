import { ArithmeticError } from './errors.js';
import { isFiniteNumber, isInteger, positive } from './assert.js';
import { roundHalfUp, truncate } from './numbers.js';
import { bushelsFromDecimal, bushelsToDecimal } from './money.js';

/**
 * Weight, bushels and volume.
 *
 * The one thing worth saying twice: settlement bushels come off the legal
 * weight per bushel for the commodity, not off the test weight of the load. A
 * light load of corn still divides by 56. The test weight buys the grower a
 * discount, it does not buy him fewer bushels.
 */

export const CUBIC_INCHES_PER_BUSHEL = 2150.42;
export const CUBIC_FEET_PER_BUSHEL = CUBIC_INCHES_PER_BUSHEL / 1728;
export const POUNDS_PER_TONNE = 2204.62262;
export const POUNDS_PER_SHORT_TON = 2000;
export const POUNDS_PER_HUNDREDWEIGHT = 100;

/** Net pounds to hundredths of a bushel at the legal weight for the commodity. */
export function poundsToBushels(pounds, legalWeightPerBushel) {
  isFiniteNumber(pounds, 'pounds');
  positive(legalWeightPerBushel, 'legalWeightPerBushel');
  return bushelsFromDecimal(truncate(pounds / legalWeightPerBushel, 2));
}

export function bushelsToPounds(bushelHundredths, legalWeightPerBushel) {
  isInteger(bushelHundredths, 'bushelHundredths');
  positive(legalWeightPerBushel, 'legalWeightPerBushel');
  return roundHalfUp(bushelsToDecimal(bushelHundredths) * legalWeightPerBushel, 2);
}

/** Weight a load actually occupies in the bin, which does use the test weight. */
export function bushelsAtTestWeight(pounds, testWeightPerBushel) {
  isFiniteNumber(pounds, 'pounds');
  positive(testWeightPerBushel, 'testWeightPerBushel');
  return bushelsFromDecimal(truncate(pounds / testWeightPerBushel, 2));
}

export function cubicFeetToBushels(cubicFeet) {
  isFiniteNumber(cubicFeet, 'cubicFeet');
  return bushelsFromDecimal(roundHalfUp(cubicFeet / CUBIC_FEET_PER_BUSHEL, 2));
}

export function bushelsToCubicFeet(bushelHundredths) {
  isInteger(bushelHundredths, 'bushelHundredths');
  return roundHalfUp(bushelsToDecimal(bushelHundredths) * CUBIC_FEET_PER_BUSHEL, 3);
}

export function poundsToTonnes(pounds) {
  isFiniteNumber(pounds, 'pounds');
  return roundHalfUp(pounds / POUNDS_PER_TONNE, 4);
}

export function tonnesToBushels(tonnes, legalWeightPerBushel) {
  isFiniteNumber(tonnes, 'tonnes');
  positive(legalWeightPerBushel, 'legalWeightPerBushel');
  return poundsToBushels(tonnes * POUNDS_PER_TONNE, legalWeightPerBushel);
}

export function poundsToHundredweight(pounds) {
  isFiniteNumber(pounds, 'pounds');
  return roundHalfUp(pounds / POUNDS_PER_HUNDREDWEIGHT, 2);
}

export function poundsToShortTons(pounds) {
  isFiniteNumber(pounds, 'pounds');
  return roundHalfUp(pounds / POUNDS_PER_SHORT_TON, 4);
}

/**
 * The Winchester kettle holds a quart. The tester weighs that quart and the
 * table turns it into pounds per bushel; a bushel is thirty two quarts, so the
 * arithmetic is a multiply and a rounding to the tenth the tables report.
 */
export function testWeightFromKettle(quartGrams) {
  positive(quartGrams, 'quartGrams');
  const poundsPerQuart = quartGrams / 453.59237;
  return roundHalfUp(poundsPerQuart * 32, 1);
}

/**
 * Gross minus tare, refusing the ticket where the tare is heavier. That happens
 * when the scale operator keys the two weights into the wrong boxes and it must
 * never quietly settle as a negative load.
 */
export function netWeight(grossPounds, tarePounds) {
  isFiniteNumber(grossPounds, 'grossPounds');
  isFiniteNumber(tarePounds, 'tarePounds');
  if (tarePounds > grossPounds) {
    throw new ArithmeticError(
      'TARE_OVER_GROSS',
      `tare ${tarePounds} is over gross ${grossPounds}`,
      {
        grossPounds,
        tarePounds,
      }
    );
  }
  return roundHalfUp(grossPounds - tarePounds, 0);
}
