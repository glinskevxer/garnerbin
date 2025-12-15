import { ConfigError } from '../core/errors.js';
import {
  inRange,
  isInteger,
  isPlainObject,
  isString,
  nonNegative,
  positive,
} from '../core/assert.js';
import { roundHalfUp } from '../core/numbers.js';
import { extend, formatMoney } from '../core/money.js';
import { assertDay, compareDays, daysBetween } from '../core/dates.js';

/**
 * Advances against grain that is not priced yet.
 *
 * A grower with grain in delayed price wants money before he wants a price. The
 * house will lend against it, but never the whole value, because the grain is
 * the only security and the market can fall between today and the day he
 * prices. The margin is why the advance percent exists.
 *
 * Interest runs on actual days over three hundred and sixty five. Nobody in
 * this business uses a thirty day month for money they lent.
 */

export const DEFAULT_ADVANCE_PERCENT = 70;
export const DAYS_IN_YEAR = 365;

/** The most the house will lend against this grain at this market. */
export function advanceLimit({
  bushelHundredths,
  marketPoints,
  percent = DEFAULT_ADVANCE_PERCENT,
}) {
  isInteger(bushelHundredths, 'bushelHundredths');
  isInteger(marketPoints, 'marketPoints');
  inRange(percent, 'percent', 0, 100);
  const value = extend(marketPoints, bushelHundredths);
  return { valueCents: value, percent, limitCents: Math.floor((value * percent) / 100) };
}

export function createAdvance(input) {
  isPlainObject(input, 'advance');
  return Object.freeze({
    id: isString(input.id, 'id'),
    account: isString(input.account, 'account'),
    day: assertDay(input.day, 'day'),
    principalCents: positive(isInteger(input.principalCents, 'principalCents'), 'principalCents'),
    annualRate: nonNegative(input.annualRate, 'annualRate'),
    against: input.against === undefined ? null : isString(input.against, 'against'),
    repaidOn: null,
  });
}

export function daysOutstanding(advance, asOf) {
  assertDay(asOf, 'asOf');
  if (compareDays(asOf, advance.day) < 0) {
    throw new ConfigError('BEFORE_THE_ADVANCE', `${asOf} is before ${advance.id} was drawn`, {
      id: advance.id,
      day: advance.day,
      asOf,
    });
  }
  const end =
    advance.repaidOn !== null && compareDays(advance.repaidOn, asOf) < 0 ? advance.repaidOn : asOf;
  return daysBetween(advance.day, end);
}

export function interestOn(advance, asOf) {
  const days = daysOutstanding(advance, asOf);
  const raw = (advance.principalCents * advance.annualRate * days) / DAYS_IN_YEAR;
  return Math.round(roundHalfUp(raw, 0));
}

export function payoff(advance, asOf) {
  const interest = interestOn(advance, asOf);
  return {
    id: advance.id,
    days: daysOutstanding(advance, asOf),
    principalCents: advance.principalCents,
    interestCents: interest,
    totalCents: advance.principalCents + interest,
  };
}

export function repay(advance, day) {
  if (advance.repaidOn !== null) {
    throw new ConfigError('ALREADY_REPAID', `${advance.id} was repaid on ${advance.repaidOn}`, {
      id: advance.id,
    });
  }
  const on = assertDay(day, 'day');
  if (compareDays(on, advance.day) < 0) {
    throw new ConfigError('REPAID_BEFORE_DRAWN', `${on} is before ${advance.day}`, {
      id: advance.id,
    });
  }
  return Object.freeze({ ...advance, repaidOn: on });
}

export function isOutstanding(advance) {
  return advance.repaidOn === null;
}

/** How much is left to draw against a limit with advances already on it. */
export function availableToDraw(limit, advances, asOf) {
  const outstanding = advances
    .filter((advance) => isOutstanding(advance))
    .reduce((sum, advance) => sum + payoff(advance, asOf).totalCents, 0);
  return {
    limitCents: limit.limitCents,
    outstandingCents: outstanding,
    availableCents: Math.max(0, limit.limitCents - outstanding),
    overDrawn: outstanding > limit.limitCents,
  };
}

/**
 * The market can fall far enough that the advance is worth more than the grain
 * behind it. That is a call, and it is the reason the percent is not a hundred.
 */
export function marginCallOn(limit, advances, asOf) {
  const standing = availableToDraw(limit, advances, asOf);
  if (!standing.overDrawn) {
    return {
      called: false,
      cents: 0,
      line: `${formatMoney(standing.availableCents)} left to draw`,
    };
  }
  const shortfall = standing.outstandingCents - limit.limitCents;
  return {
    called: true,
    cents: shortfall,
    line: `${formatMoney(shortfall)} over the limit on ${formatMoney(limit.valueCents)} of grain`,
  };
}
