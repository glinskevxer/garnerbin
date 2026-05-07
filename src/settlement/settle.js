import { isArray, isInteger, isPlainObject } from '../core/assert.js';
import { extend } from '../core/money.js';
import { settlementWeights } from '../weights/conversion.js';
import { dryingCharge } from '../weights/drying.js';
import { grossBushelsOf } from '../weights/ticket.js';
import { gradeSample } from '../grading/special.js';
import { readingsOf } from '../grading/sample.js';
import { totalDiscount } from '../pricing/discounts.js';
import { totalPremium } from '../pricing/premiums.js';
import { applyAssessments } from './deductions.js';

/**
 * Settling one load.
 *
 * The order is the whole point. Weights first, because everything downstream is
 * per bushel. Grade next, because the discounts are read off the grade factors
 * and not off the grade. Then price, then the charges that are money rather
 * than cents a bushel.
 *
 * Discounts come off the price and not off the value. That distinction does not
 * change the total on a single load, but it does change what prints on the
 * statement and what the grower argues about, and it is what every posted
 * schedule in the country means by a discount.
 *
 * Premiums go on the same way and in the same units. A house that pays for
 * protein and discounts for damage does both to the price, and the net price is
 * what everything downstream multiplies by.
 */

export function settleLoad(input) {
  isPlainObject(input, 'settlement');
  const ticket = isPlainObject(input.ticket, 'ticket');
  const sample = isPlainObject(input.sample, 'sample');
  const bidPoints = isInteger(input.bidPoints, 'bidPoints');
  const assessments = isArray(input.assessments ?? [], 'assessments');

  const readings = readingsOf(sample);
  const graded = gradeSample(ticket.commodity, sample);
  const weights = settlementWeights({
    commodity: ticket.commodity,
    netPounds: ticket.netPounds,
    moisture: readings.moisture,
    dockagePercent: readings.dockage ?? 0,
    shrinkFactor: input.shrinkFactor,
    handlingPercent: input.handlingPercent,
    targetMoisture: input.targetMoisture,
  });

  const discounts = input.discountSchedule
    ? totalDiscount(input.discountSchedule, readings)
    : { lines: [], totalPoints: 0 };
  const premiums = input.premiumSchedule
    ? totalPremium(input.premiumSchedule, readings)
    : { lines: [], totalPoints: 0 };
  const netPricePoints = bidPoints - discounts.totalPoints + premiums.totalPoints;
  const grossCents = extend(bidPoints, weights.netBushels);
  const discountCents = extend(discounts.totalPoints, weights.netBushels);
  const premiumCents = extend(premiums.totalPoints, weights.netBushels);
  const valueCents = extend(netPricePoints, weights.netBushels);

  const drying =
    input.dryingSchedule && typeof readings.moisture === 'number'
      ? dryingCharge(input.dryingSchedule, {
          commodity: ticket.commodity,
          moisture: readings.moisture,
          bushelHundredths: weights.netBushels,
        })
      : { points: 0, ratePoints: 0, cents: 0 };

  const applied = applyAssessments(assessments, {
    bushelHundredths: weights.netBushels,
    grossCents: valueCents,
  });

  const netCents = valueCents - drying.cents - applied.totalCents;

  return {
    ticket: ticket.number,
    day: ticket.day,
    account: ticket.account,
    commodity: ticket.commodity,
    grossTicketBushels: grossBushelsOf(ticket),
    weights,
    grade: graded,
    bidPoints,
    discountLines: discounts.lines,
    discountPoints: discounts.totalPoints,
    premiumLines: premiums.lines,
    premiumPoints: premiums.totalPoints,
    netPricePoints,
    grossCents,
    discountCents,
    premiumCents,
    valueCents,
    drying,
    assessments: applied,
    netCents,
  };
}

/** Settle a run of loads and add them up the way the daily register does. */
export function settleRun(loads, shared) {
  isArray(loads, 'loads', { minLength: 1 });
  const settled = loads.map((load) => settleLoad({ ...shared, ...load }));
  return {
    settlements: settled,
    netBushels: settled.reduce((sum, entry) => sum + entry.weights.netBushels, 0),
    grossBushels: settled.reduce((sum, entry) => sum + entry.weights.grossBushels, 0),
    netCents: settled.reduce((sum, entry) => sum + entry.netCents, 0),
    dryingCents: settled.reduce((sum, entry) => sum + entry.drying.cents, 0),
    discountCents: settled.reduce((sum, entry) => sum + entry.discountCents, 0),
  };
}

/** The average price the grower actually got, after everything came off. */
export function realisedPrice(settlement) {
  if (settlement.weights.netBushels === 0) return 0;
  return Math.round((settlement.netCents * 10_000) / settlement.weights.netBushels);
}
