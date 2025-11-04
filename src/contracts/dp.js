import { ContractError } from '../core/errors.js';
import { isInteger, isPlainObject, nonNegative, oneOf } from '../core/assert.js';
import { roundHalfUp } from '../core/numbers.js';
import { chargePerBushel } from '../core/money.js';
import { addDays, assertDay, compareDays, daysBetween } from '../core/dates.js';

/**
 * Delayed price service charges.
 *
 * The grower delivers, title passes to the house, and the price is set some
 * time later. The house is carrying the grain and the market risk in the
 * meantime and charges for it by the bushel by the month.
 *
 * Two houses in the same county will prorate that differently. Daily proration
 * charges to the day the grower prices. Monthly charges for the whole month the
 * moment it starts, which on a contract priced on the second of the month is a
 * month of charge for two days of carry, and growers know it.
 */

export const PRORATION = Object.freeze(['daily', 'monthly']);
export const DAYS_PER_MONTH = 30;

export function createDpTerms(input) {
  isPlainObject(input, 'terms');
  return Object.freeze({
    ratePointsPerMonth: nonNegative(input.ratePointsPerMonth, 'ratePointsPerMonth'),
    freeDays: nonNegative(isInteger(input.freeDays ?? 0, 'freeDays'), 'freeDays'),
    minimumPoints: nonNegative(input.minimumPoints ?? 0, 'minimumPoints'),
    proration: oneOf(input.proration ?? 'daily', 'proration', PRORATION),
  });
}

export function daysHeld(deliveredOn, pricedOn) {
  assertDay(deliveredOn, 'deliveredOn');
  assertDay(pricedOn, 'pricedOn');
  if (compareDays(pricedOn, deliveredOn) < 0) {
    throw new ContractError('PRICED_BEFORE_DELIVERY', `${pricedOn} is before ${deliveredOn}`, {
      deliveredOn,
      pricedOn,
    });
  }
  return daysBetween(deliveredOn, pricedOn);
}

export function chargeableDays(terms, days) {
  return Math.max(0, days - terms.freeDays);
}

/** The rate a load has run up, in points a bushel, before any minimum. */
export function accruedPoints(terms, days) {
  const chargeable = chargeableDays(terms, days);
  if (chargeable === 0) return 0;
  if (terms.proration === 'monthly') {
    const months = Math.ceil(chargeable / DAYS_PER_MONTH);
    return roundHalfUp(months * terms.ratePointsPerMonth, 4);
  }
  return roundHalfUp((chargeable / DAYS_PER_MONTH) * terms.ratePointsPerMonth, 4);
}

export function dpCharge(terms, { bushelHundredths, deliveredOn, pricedOn }) {
  const days = daysHeld(deliveredOn, pricedOn);
  const points = accruedPoints(terms, days);
  const rate = points === 0 ? 0 : Math.max(points, terms.minimumPoints);
  return {
    days,
    chargeableDays: chargeableDays(terms, days),
    ratePoints: roundHalfUp(rate, 2),
    cents: chargePerBushel(Math.round(rate), isInteger(bushelHundredths, 'bushelHundredths')),
  };
}

/** What the charge stands at today on a load nobody has priced yet. */
export function accrualAsOf(terms, { bushelHundredths, deliveredOn, asOf }) {
  return dpCharge(terms, { bushelHundredths, deliveredOn, pricedOn: asOf });
}

/** The day the charge would first bite, which is what the grower asks. */
export function firstChargeDay(terms, deliveredOn) {
  return addDays(assertDay(deliveredOn, 'deliveredOn'), terms.freeDays + 1);
}
