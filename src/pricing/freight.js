import { ConfigError } from '../core/errors.js';
import { isArray, isPlainObject, isString, nonNegative, oneOf, positive } from '../core/assert.js';
import { roundHalfUp } from '../core/numbers.js';
import { formatPrice } from '../core/money.js';
import { assertCommodityId, legalWeight } from '../commodity/registry.js';
import { POUNDS_PER_TONNE } from '../core/units.js';

/**
 * Freight, and the netback it turns a delivered bid into.
 *
 * A buyer quotes delivered and the house has to work backwards to what it can
 * pay at the pit. Doing that in cents a bushel is the only way the answer is
 * comparable across two destinations at different distances in different
 * trucks, which is the whole point of the exercise.
 *
 * Rates come in four shapes because the four kinds of hauler quote differently.
 */

export const RATE_KINDS = Object.freeze(['perBushel', 'perMile', 'perTonMile', 'flat']);

export function createFreightRate(input) {
  isPlainObject(input, 'rate');
  const kind = oneOf(input.kind, 'kind', RATE_KINDS);
  const rate = {
    id: isString(input.id, 'id'),
    destination: isString(input.destination, 'destination'),
    kind,
    miles: input.miles === undefined ? null : nonNegative(input.miles, 'miles'),
    minimumPoints: nonNegative(input.minimumPoints ?? 0, 'minimumPoints'),
    fuelSurchargePercent: nonNegative(input.fuelSurchargePercent ?? 0, 'fuelSurchargePercent'),
  };
  if (kind === 'perBushel') rate.points = nonNegative(input.points, 'points');
  if (kind === 'flat') rate.dollars = nonNegative(input.dollars, 'dollars');
  if (kind === 'perMile') rate.dollarsPerMile = nonNegative(input.dollarsPerMile, 'dollarsPerMile');
  if (kind === 'perTonMile') {
    rate.dollarsPerTonMile = nonNegative(input.dollarsPerTonMile, 'dollarsPerTonMile');
  }
  if (kind !== 'perBushel' && kind !== 'flat' && rate.miles === null) {
    throw new ConfigError('NO_MILES', `a ${kind} rate needs the miles`, { id: rate.id, kind });
  }
  return Object.freeze(rate);
}

/**
 * Freight in points a bushel. Everything that is quoted per load has to be
 * divided by the load, so the load size is part of the question and not an
 * afterthought.
 */
export function freightPoints(rate, { bushels, commodity }) {
  const load = positive(bushels, 'bushels');
  let dollars;
  if (rate.kind === 'perBushel') {
    dollars = (rate.points / 10_000) * load;
  } else if (rate.kind === 'flat') {
    dollars = rate.dollars;
  } else if (rate.kind === 'perMile') {
    dollars = rate.dollarsPerMile * rate.miles;
  } else {
    assertCommodityId(commodity);
    const tonnes = (load * legalWeight(commodity)) / POUNDS_PER_TONNE;
    dollars = rate.dollarsPerTonMile * tonnes * rate.miles;
  }
  const withFuel = dollars * (1 + rate.fuelSurchargePercent / 100);
  const points = Math.round((withFuel / load) * 10_000);
  return Math.max(points, rate.minimumPoints);
}

/** The pit bid a delivered bid works back to. */
export function netback(deliveredPoints, freight) {
  return deliveredPoints - freight;
}

/** And forwards, for a house quoting delivered off its own pit bid. */
export function deliveredFrom(pitPoints, freight) {
  return pitPoints + freight;
}

/**
 * Rank destinations by what they net back to the pit. The nearest buyer is
 * often not the best one and the highest delivered bid frequently is not
 * either, which is why this exists.
 */
export function compareDestinations(destinations, load) {
  isArray(destinations, 'destinations', { minLength: 1 });
  return destinations
    .map((entry) => {
      const freight = freightPoints(entry.rate, load);
      return {
        destination: entry.rate.destination,
        deliveredPoints: entry.deliveredPoints,
        freightPoints: freight,
        netbackPoints: netback(entry.deliveredPoints, freight),
        miles: entry.rate.miles,
      };
    })
    .sort((a, b) => b.netbackPoints - a.netbackPoints);
}

export function bestDestination(destinations, load) {
  return compareDestinations(destinations, load)[0];
}

export function describeNetback(row) {
  return `${row.destination} bids ${formatPrice(row.deliveredPoints)} and nets ${formatPrice(row.netbackPoints)} after ${formatPrice(row.freightPoints)} of freight`;
}

/** What a mile is worth, which is the number a hauler negotiates against. */
export function pointsPerMile(rate, load) {
  if (rate.miles === null || rate.miles === 0) return 0;
  return roundHalfUp(freightPoints(rate, load) / rate.miles, 4);
}
