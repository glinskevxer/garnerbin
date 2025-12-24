import { ContractError } from '../core/errors.js';
import { isInteger, isPlainObject, isString, oneOf, positive } from '../core/assert.js';
import { formatPrice } from '../core/money.js';
import { assertDay, compareDays } from '../core/dates.js';
import { formatContract, parseContract } from '../pricing/board.js';

/**
 * Minimum price contracts.
 *
 * A minimum price contract is a cash sale with an option bolted on. The grower
 * sells the grain and keeps the right to a higher price if the board rallies,
 * and pays for that right in premium, which comes straight off the settlement.
 *
 * So the floor is not the strike. The floor is the cash price less the premium,
 * and a grower who is quoted the strike as his minimum has been misled.
 */

export const OPTION_KINDS = Object.freeze(['call', 'put']);

export function createOptionLeg(input) {
  isPlainObject(input, 'option');
  return Object.freeze({
    id: isString(input.id, 'id'),
    kind: oneOf(input.kind ?? 'call', 'kind', OPTION_KINDS),
    contract: parseContract(isString(input.contract, 'contract')),
    strikePoints: isInteger(input.strikePoints, 'strikePoints'),
    premiumPoints: positive(isInteger(input.premiumPoints, 'premiumPoints'), 'premiumPoints'),
    boughtOn: assertDay(input.boughtOn, 'boughtOn'),
    expiresOn: assertDay(input.expiresOn, 'expiresOn'),
    bushels: positive(isInteger(input.bushels, 'bushels'), 'bushels'),
  });
}

/** What the option is worth if it were exercised now. Never negative. */
export function intrinsicValue(leg, futuresPoints) {
  isInteger(futuresPoints, 'futuresPoints');
  const distance =
    leg.kind === 'call' ? futuresPoints - leg.strikePoints : leg.strikePoints - futuresPoints;
  return Math.max(0, distance);
}

export function isInTheMoney(leg, futuresPoints) {
  return intrinsicValue(leg, futuresPoints) > 0;
}

export function hasExpired(leg, day) {
  return compareDays(assertDay(day, 'day'), leg.expiresOn) > 0;
}

/**
 * The floor the grower actually has. Cash price less what the option cost him.
 */
export function floorPrice(cashPoints, leg) {
  isInteger(cashPoints, 'cashPoints');
  return cashPoints - leg.premiumPoints;
}

/** What he ends up with, given where the board finished. */
export function finalPrice(cashPoints, leg, futuresPoints) {
  return floorPrice(cashPoints, leg) + intrinsicValue(leg, futuresPoints);
}

/**
 * The board has to rally past the strike by the premium before the grower is
 * better off than a straight cash sale. That number is what he should be told.
 */
export function breakEvenFutures(leg) {
  return leg.kind === 'call'
    ? leg.strikePoints + leg.premiumPoints
    : leg.strikePoints - leg.premiumPoints;
}

export function settleOption(leg, { futuresPoints, day }) {
  const on = assertDay(day, 'day');
  if (compareDays(on, leg.boughtOn) < 0) {
    throw new ContractError('SETTLED_BEFORE_BOUGHT', `${on} is before ${leg.id} was bought`, {
      id: leg.id,
      boughtOn: leg.boughtOn,
    });
  }
  const value = intrinsicValue(leg, futuresPoints);
  const expired = hasExpired(leg, on);
  return {
    id: leg.id,
    day: on,
    futuresPoints,
    intrinsicPoints: value,
    outcome: value > 0 ? 'exercised' : expired ? 'expired worthless' : 'still open',
    netPoints: value - leg.premiumPoints,
  };
}

export function describeLeg(leg) {
  return `${leg.id}: ${formatPrice(leg.strikePoints)} ${leg.kind} on ${formatContract(leg.contract)} for ${formatPrice(leg.premiumPoints)}`;
}

/** A table of what the grower gets across a range of finishes. */
export function payoffTable(cashPoints, leg, from, to, step = 2500) {
  const rows = [];
  for (let futures = from; futures <= to; futures += step) {
    rows.push({
      futuresPoints: futures,
      intrinsicPoints: intrinsicValue(leg, futures),
      pricePoints: finalPrice(cashPoints, leg, futures),
    });
  }
  return rows;
}
