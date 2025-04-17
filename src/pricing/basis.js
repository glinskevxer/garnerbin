import { ConfigError } from '../core/errors.js';
import { isArray, isInteger, isPlainObject, isString } from '../core/assert.js';
import { formatPrice, POINTS_PER_DOLLAR } from '../core/money.js';
import { assertCommodityId } from '../commodity/registry.js';
import { parseContract } from './board.js';

/**
 * Basis.
 *
 * Cash bid equals the board plus the basis, and the basis is the only half of
 * that the house sets. It is quoted in cents against a named delivery month and
 * it is nearly always negative at a country house, because the freight to the
 * river has to come out of somewhere.
 *
 * Everything here is in points, so a basis of minus thirty five cents is -3500.
 */

const BASIS_LIMIT = 3 * 10_000;

export function createBasisBoard(input) {
  isPlainObject(input, 'board');
  const commodity = assertCommodityId(input.commodity);
  const quotes = isArray(input.quotes, 'quotes', { minLength: 1 }).map((quote) => {
    isPlainObject(quote, 'quote');
    const period = isString(quote.period, 'period');
    if (!/^\d{4}-\d{2}$/.test(period)) {
      throw new ConfigError('BAD_PERIOD', `${period} is not a delivery period like 2025-10`, {
        period,
      });
    }
    const points = isInteger(quote.basisPoints, 'basisPoints');
    if (Math.abs(points) > BASIS_LIMIT) {
      throw new ConfigError('BASIS_OUT_OF_RANGE', `a basis of ${formatPrice(points)} is not real`, {
        period,
        basisPoints: points,
      });
    }
    return Object.freeze({
      period,
      contract: parseContract(quote.contract),
      basisPoints: points,
    });
  });
  const seen = new Set();
  for (const quote of quotes) {
    if (seen.has(quote.period)) {
      throw new ConfigError('DUPLICATE_PERIOD', `${quote.period} is quoted twice`, {
        period: quote.period,
      });
    }
    seen.add(quote.period);
  }
  return Object.freeze({
    house: isString(input.house, 'house'),
    commodity,
    day: isString(input.day, 'day'),
    quotes: Object.freeze(quotes),
  });
}

export function quoteFor(board, period) {
  const found = board.quotes.find((quote) => quote.period === period);
  if (!found) {
    throw new ConfigError('NO_BASIS_QUOTE', `${board.house} does not quote ${period}`, {
      house: board.house,
      period,
      quoted: board.quotes.map((quote) => quote.period),
    });
  }
  return found;
}

export function basisFor(board, period) {
  return quoteFor(board, period).basisPoints;
}

/** Board plus basis. Nothing else goes into a posted bid. */
export function cashBid(futuresPoints, basisPoints) {
  isInteger(futuresPoints, 'futuresPoints');
  isInteger(basisPoints, 'basisPoints');
  return futuresPoints + basisPoints;
}

export function bidFrom(board, period, futuresPoints) {
  return cashBid(futuresPoints, basisFor(board, period));
}

/** The board writes it in dollars against the futures month, sign and all. */
export function formatBasis(points) {
  const dollars = points / POINTS_PER_DOLLAR;
  const sign = points < 0 ? '-' : '+';
  return `${sign}${Math.abs(dollars).toFixed(2)}`;
}

/** A basis that moves toward zero has narrowed, which is what a seller wants. */
export function basisMove(fromPoints, toPoints) {
  const change = toPoints - fromPoints;
  return {
    change,
    direction: change === 0 ? 'flat' : change > 0 ? 'narrowed' : 'widened',
  };
}

/** The carry the basis board itself is offering between two periods. */
export function basisCarry(board, fromPeriod, toPeriod) {
  return basisFor(board, toPeriod) - basisFor(board, fromPeriod);
}

/** Which house is paying the most for a period, across several boards. */
export function bestBasis(boards, period) {
  isArray(boards, 'boards', { minLength: 1 });
  const priced = boards
    .filter((board) => board.quotes.some((quote) => quote.period === period))
    .map((board) => ({ house: board.house, basisPoints: basisFor(board, period) }));
  if (priced.length === 0) {
    throw new ConfigError('NOBODY_QUOTES', `no board quotes ${period}`, { period });
  }
  return priced.reduce((best, entry) => (entry.basisPoints > best.basisPoints ? entry : best));
}
