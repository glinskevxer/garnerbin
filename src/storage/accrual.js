import { isInteger, isPlainObject, nonNegative, oneOf } from '../core/assert.js';
import { roundHalfUp } from '../core/numbers.js';
import { chargePerBushel } from '../core/money.js';
import { addDays, assertDay, compareDays, daysBetween } from '../core/dates.js';

/**
 * Storage on open storage grain.
 *
 * Grain in open storage still belongs to the grower. The house is holding it,
 * so the house charges rent, and every country elevator gives the harvest away
 * free until some date after the first of the year to keep the pit moving in
 * October.
 *
 * The free period is a date and not a number of days, which matters: a load
 * delivered on the last day of harvest gets the same free ride as one delivered
 * on the first, and that is deliberate.
 */

export const PRORATION = Object.freeze(['daily', 'monthly']);
export const DAYS_PER_MONTH = 30;

export function createStorageTerms(input) {
  isPlainObject(input, 'terms');
  const terms = {
    ratePointsPerMonth: nonNegative(input.ratePointsPerMonth, 'ratePointsPerMonth'),
    proration: oneOf(input.proration ?? 'daily', 'proration', PRORATION),
    freeUntil: input.freeUntil === undefined ? null : assertDay(input.freeUntil, 'freeUntil'),
    freeDays: nonNegative(isInteger(input.freeDays ?? 0, 'freeDays'), 'freeDays'),
    capPoints: input.capPoints === undefined ? null : nonNegative(input.capPoints, 'capPoints'),
  };
  return Object.freeze(terms);
}

/** The first day rent starts running for grain put in on this day. */
export function chargesFrom(terms, storedFrom) {
  assertDay(storedFrom, 'storedFrom');
  const afterFreeDays = addDays(storedFrom, terms.freeDays);
  if (terms.freeUntil === null) return afterFreeDays;
  return compareDays(terms.freeUntil, afterFreeDays) > 0 ? terms.freeUntil : afterFreeDays;
}

export function chargeableDays(terms, storedFrom, asOf) {
  assertDay(asOf, 'asOf');
  const start = chargesFrom(terms, storedFrom);
  const days = daysBetween(start, asOf);
  return Math.max(0, days);
}

export function accruedPoints(terms, days) {
  nonNegative(days, 'days');
  if (days === 0) return 0;
  const months =
    terms.proration === 'monthly' ? Math.ceil(days / DAYS_PER_MONTH) : days / DAYS_PER_MONTH;
  const points = roundHalfUp(months * terms.ratePointsPerMonth, 4);
  return terms.capPoints === null ? points : Math.min(points, terms.capPoints);
}

export function storageCharge(terms, { bushelHundredths, storedFrom, asOf }) {
  const days = chargeableDays(terms, storedFrom, asOf);
  const points = accruedPoints(terms, days);
  return {
    chargesFrom: chargesFrom(terms, storedFrom),
    days,
    ratePoints: roundHalfUp(points, 2),
    cents: chargePerBushel(Math.round(points), isInteger(bushelHundredths, 'bushelHundredths')),
  };
}

const BUCKETS = [
  { label: '0 to 30', through: 30 },
  { label: '31 to 60', through: 60 },
  { label: '61 to 90', through: 90 },
  { label: '91 to 180', through: 180 },
  { label: 'over 180', through: null },
];

export function agingBucket(days) {
  nonNegative(days, 'days');
  return BUCKETS.find((bucket) => bucket.through === null || days <= bucket.through).label;
}

/** Group open storage lots by how long they have been sitting. */
export function ageLots(lots, asOf) {
  const totals = new Map(BUCKETS.map((bucket) => [bucket.label, 0]));
  for (const lot of lots) {
    const days = Math.max(0, daysBetween(lot.storedFrom, asOf));
    const label = agingBucket(days);
    totals.set(label, totals.get(label) + lot.bushels);
  }
  return BUCKETS.map((bucket) => ({ bucket: bucket.label, bushels: totals.get(bucket.label) }));
}
