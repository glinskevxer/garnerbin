import { ConfigError } from '../core/errors.js';
import { isArray, isInteger, isPlainObject, isString } from '../core/assert.js';
import { roundHalfUp } from '../core/numbers.js';
import { formatPrice } from '../core/money.js';
import { assertDay } from '../core/dates.js';
import { formatContract, parseContract } from './board.js';

/**
 * The settlement board for one day.
 *
 * The spread between two months is the thing the merchandiser reads first. A
 * deferred month over the nearby is carry, and the market is paying the house
 * to hold grain. A deferred month under the nearby is an inverse, and the
 * market is asking for the grain now.
 */

export function createQuoteBoard(input) {
  isPlainObject(input, 'board');
  const day = assertDay(input.day, 'day');
  const quotes = isArray(input.quotes, 'quotes', { minLength: 1 }).map((quote) => {
    isPlainObject(quote, 'quote');
    const contract = parseContract(isString(quote.contract, 'contract'));
    return Object.freeze({
      contract,
      key: formatContract(contract),
      settle: isInteger(quote.settle, 'settle'),
      volume: quote.volume === undefined ? null : isInteger(quote.volume, 'volume'),
    });
  });
  const keys = quotes.map((quote) => quote.key);
  const duplicate = keys.find((key, index) => keys.indexOf(key) !== index);
  if (duplicate) {
    throw new ConfigError('DUPLICATE_QUOTE', `${duplicate} is on the board twice`, {
      contract: duplicate,
    });
  }
  return Object.freeze({
    day,
    source: input.source ?? 'settlement',
    quotes: Object.freeze(quotes),
  });
}

export function settleOf(board, contract) {
  const key =
    typeof contract === 'string'
      ? formatContract(parseContract(contract))
      : formatContract(contract);
  const found = board.quotes.find((quote) => quote.key === key);
  if (!found) {
    throw new ConfigError('NO_QUOTE', `${key} did not settle on ${board.day}`, {
      contract: key,
      day: board.day,
      board: board.quotes.map((quote) => quote.key),
    });
  }
  return found.settle;
}

export function monthsApart(nearby, deferred) {
  const a = typeof nearby === 'string' ? parseContract(nearby) : nearby;
  const b = typeof deferred === 'string' ? parseContract(deferred) : deferred;
  return (b.year - a.year) * 12 + (b.month - a.month);
}

/** Deferred minus nearby. Positive is carry, negative is an inverse. */
export function spread(board, nearby, deferred) {
  const points = settleOf(board, deferred) - settleOf(board, nearby);
  const months = monthsApart(nearby, deferred);
  return {
    points,
    months,
    shape: points === 0 ? 'flat' : points > 0 ? 'carry' : 'inverse',
    perMonth: months === 0 ? 0 : roundHalfUp(points / months, 2),
  };
}

/**
 * What it costs the house to carry a bushel for a month: the storage it is
 * giving up plus the interest on the money tied up in the grain.
 */
export function carryCost({ storagePointsPerMonth, annualInterestRate, pricePoints, months }) {
  isInteger(months, 'months');
  const interest = (pricePoints * annualInterestRate * months) / 12;
  return roundHalfUp(storagePointsPerMonth * months + interest, 2);
}

/**
 * The share of full carry the board is paying. Anything near a hundred says the
 * market will pay the house to store, and anything low or negative says sell it
 * and be done.
 */
export function percentOfFullCarry(board, nearby, deferred, costInput) {
  const measured = spread(board, nearby, deferred);
  const cost = carryCost({
    ...costInput,
    months: measured.months,
    pricePoints: costInput.pricePoints ?? settleOf(board, nearby),
  });
  if (cost === 0) {
    throw new ConfigError('NO_CARRY_COST', 'full carry works out to nothing', { ...costInput });
  }
  return roundHalfUp((measured.points / cost) * 100, 1);
}

export function renderBoard(board) {
  return board.quotes
    .map((quote) => `${quote.key.padEnd(8)}${formatPrice(quote.settle, 4).padStart(10)}`)
    .join('\n');
}
