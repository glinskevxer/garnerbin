import { ConfigError } from '../core/errors.js';
import { isArray, isPlainObject, isString } from '../core/assert.js';
import { assertDay } from '../core/dates.js';
import { formatPrice } from '../core/money.js';
import { heading, keyValue, renderTable } from '../core/text.js';
import { getCommodity } from '../commodity/registry.js';
import { formatContract } from './board.js';
import { settleOf } from './quotes.js';
import { basisFor, cashBid, formatBasis } from './basis.js';
import { boardFor, commoditiesQuoted } from './basisbook.js';

/**
 * The bid sheet on the wall.
 *
 * Board plus basis for every commodity and every delivery period the house
 * quotes, worked out once so the number on the wall, the number the scale house
 * quotes down the phone and the number the settlement uses are the same number.
 * They have not always been.
 */

export function buildBidSheet(input) {
  isPlainObject(input, 'sheet');
  const day = assertDay(input.day, 'day');
  const board = isPlainObject(input.board, 'board');
  const book = isPlainObject(input.basis, 'basis');
  const wanted = input.commodities ?? commoditiesQuoted(book);
  isArray(wanted, 'commodities', { minLength: 1 });

  const rows = [];
  const problems = [];
  for (const commodity of wanted) {
    let quotes;
    try {
      quotes = boardFor(book, commodity).quotes;
    } catch (error) {
      problems.push(error.message);
      continue;
    }
    for (const quote of quotes) {
      const month = formatContract(quote.contract);
      let settle;
      try {
        settle = settleOf(board, month);
      } catch {
        problems.push(
          `${commodity} for ${quote.period} needs ${month} and the board has no ${month}`
        );
        continue;
      }
      const basisPoints = basisFor(boardFor(book, commodity), quote.period);
      rows.push({
        commodity,
        name: getCommodity(commodity).name,
        period: quote.period,
        month,
        settlePoints: settle,
        basisPoints,
        bidPoints: cashBid(settle, basisPoints),
      });
    }
  }
  if (rows.length === 0) {
    throw new ConfigError('NOTHING_TO_QUOTE', 'nothing on the basis book could be priced', {
      problems,
    });
  }
  return {
    house: isString(input.house, 'house'),
    day,
    rows: rows.sort(
      (a, b) => a.commodity.localeCompare(b.commodity) || a.period.localeCompare(b.period)
    ),
    problems,
  };
}

export function bidFor(sheet, commodity, period) {
  const row = sheet.rows.find((entry) => entry.commodity === commodity && entry.period === period);
  if (!row) {
    throw new ConfigError('NOT_ON_THE_SHEET', `${commodity} for ${period} is not quoted today`, {
      commodity,
      period,
      quoted: sheet.rows.map((entry) => `${entry.commodity} ${entry.period}`),
    });
  }
  return row.bidPoints;
}

export function spotBid(sheet, commodity) {
  const rows = sheet.rows.filter((entry) => entry.commodity === commodity);
  if (rows.length === 0) {
    throw new ConfigError('NOT_ON_THE_SHEET', `${commodity} is not quoted today`, { commodity });
  }
  return rows[0].bidPoints;
}

export function renderBidSheet(sheet) {
  const parts = [
    heading(`${sheet.house} bids for ${sheet.day}`),
    '',
    renderTable(
      [
        { header: 'grain', key: 'name' },
        { header: 'delivery', key: 'period' },
        { header: 'month', key: 'month' },
        { header: 'board', value: (row) => formatPrice(row.settlePoints), align: 'right' },
        { header: 'basis', value: (row) => formatBasis(row.basisPoints), align: 'right' },
        { header: 'bid', value: (row) => formatPrice(row.bidPoints), align: 'right' },
      ],
      sheet.rows
    ),
  ];
  if (sheet.problems.length > 0) {
    parts.push('', 'Not quoted today:', ...sheet.problems.map((problem) => `  ${problem}`));
  }
  parts.push(
    '',
    keyValue([
      ['Quotes', String(sheet.rows.length)],
      ['Grains', String(new Set(sheet.rows.map((row) => row.commodity)).size)],
    ])
  );
  return parts.join('\n');
}
