import { ConfigError } from '../core/errors.js';
import { isArray, isString } from '../core/assert.js';
import { assertCommodityId } from '../commodity/registry.js';
import { createBasisBoard } from './basis.js';

/**
 * One basis file for the whole house.
 *
 * The first version of this took a single commodity, which meant the settle
 * command quoted soybeans off the corn basis and nobody noticed because the
 * number that came out still looked like a price. A basis file now names the
 * commodity on every row and the book refuses to answer for one it does not
 * carry.
 */

export function buildBasisBook(rows, { house, day }) {
  isArray(rows, 'rows', { minLength: 1 });
  isString(house, 'house');
  isString(day, 'day');
  const byCommodity = new Map();
  for (const row of rows) {
    const commodity = assertCommodityId(row.commodity);
    if (!byCommodity.has(commodity)) byCommodity.set(commodity, []);
    byCommodity.get(commodity).push(row);
  }
  const boards = {};
  for (const [commodity, quotes] of byCommodity) {
    boards[commodity] = createBasisBoard({ house, commodity, day, quotes });
  }
  return Object.freeze({ house, day, boards: Object.freeze(boards) });
}

export function boardFor(book, commodityId) {
  const commodity = assertCommodityId(commodityId);
  const board = book.boards[commodity];
  if (!board) {
    throw new ConfigError(
      'NO_BASIS_FOR_COMMODITY',
      `${book.house} posts no basis for ${commodity}`,
      {
        house: book.house,
        commodity,
        posted: Object.keys(book.boards),
      }
    );
  }
  return board;
}

export function commoditiesQuoted(book) {
  return Object.keys(book.boards);
}

export function periodsFor(book, commodityId) {
  return boardFor(book, commodityId).quotes.map((quote) => quote.period);
}

export function quoteFor(book, commodityId, period) {
  const board = boardFor(book, commodityId);
  const found = board.quotes.find((quote) => quote.period === period);
  if (!found) {
    throw new ConfigError(
      'NO_BASIS_QUOTE',
      `${book.house} does not quote ${commodityId} for ${period}`,
      {
        house: book.house,
        commodity: commodityId,
        period,
        quoted: board.quotes.map((quote) => quote.period),
      }
    );
  }
  return found;
}
