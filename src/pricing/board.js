import { ConfigError } from '../core/errors.js';
import { inRange, isInteger, isString, oneOf } from '../core/assert.js';
import { addBusinessDays, addDays, compareDays, endOfMonth, isBusinessDay } from '../core/dates.js';
import { getCommodity, hedgeSymbol } from '../commodity/registry.js';

/**
 * The board.
 *
 * Delivery months carry a single letter and the office writes them the way the
 * broker does: ZCZ25 is December corn. The two dates that matter are first
 * notice day, which is the last business day of the month before delivery, and
 * last trading day, which is the business day before the fifteenth. A hedge
 * sitting in a contract past first notice day is a delivery notice waiting to
 * happen, so the roll has to be worked out from these and not from a guess.
 */

export const MONTH_CODES = Object.freeze({
  F: 1,
  G: 2,
  H: 3,
  J: 4,
  K: 5,
  M: 6,
  N: 7,
  Q: 8,
  U: 9,
  V: 10,
  X: 11,
  Z: 12,
});

const CODE_BY_MONTH = Object.freeze(
  Object.fromEntries(Object.entries(MONTH_CODES).map(([code, month]) => [month, code]))
);

const SYMBOL_PATTERN = /^([A-Z]{2,3})([FGHJKMNQUVXZ])(\d{2})$/;

export function monthForCode(code) {
  oneOf(code, 'code', Object.keys(MONTH_CODES));
  return MONTH_CODES[code];
}

export function codeForMonth(month) {
  isInteger(month, 'month');
  inRange(month, 'month', 1, 12);
  return CODE_BY_MONTH[month];
}

export function parseContract(text) {
  isString(text, 'contract');
  const match = SYMBOL_PATTERN.exec(text.trim().toUpperCase());
  if (!match) {
    throw new ConfigError('BAD_CONTRACT', `${JSON.stringify(text)} is not a contract month`, {
      text,
    });
  }
  const [, symbol, code, year] = match;
  return Object.freeze({
    symbol,
    code,
    month: MONTH_CODES[code],
    year: 2000 + Number(year),
  });
}

export function formatContract({ symbol, month, year }) {
  return `${symbol}${codeForMonth(month)}${String(year % 100).padStart(2, '0')}`;
}

/** The business day before the fifteenth of the delivery month. */
export function lastTradingDay(month, year, holidays = []) {
  const fifteenth = `${year}-${String(month).padStart(2, '0')}-15`;
  return addBusinessDays(fifteenth, -1, holidays);
}

/** The last business day of the month before delivery. */
export function firstNoticeDay(month, year, holidays = []) {
  const priorMonthEnd = endOfMonth(addDays(`${year}-${String(month).padStart(2, '0')}-01`, -1));
  let cursor = priorMonthEnd;
  while (!isBusinessDay(cursor, holidays)) cursor = addDays(cursor, -1);
  return cursor;
}

/** How many months from one contract month to another, negative going back. */
export function monthsApart(nearby, deferred) {
  const a = typeof nearby === 'string' ? parseContract(nearby) : nearby;
  const b = typeof deferred === 'string' ? parseContract(deferred) : deferred;
  return (b.year - a.year) * 12 + (b.month - a.month);
}

export function isPastFirstNotice(contract, day, holidays = []) {
  return compareDays(day, firstNoticeDay(contract.month, contract.year, holidays)) >= 0;
}

export function isExpired(contract, day, holidays = []) {
  return compareDays(day, lastTradingDay(contract.month, contract.year, holidays)) > 0;
}

/** The months this commodity actually lists, in order, starting from a day. */
export function listedContracts(commodityId, fromDay, count = 6) {
  const commodity = getCommodity(commodityId);
  const symbol = hedgeSymbol(commodityId);
  const months = commodity.deliveryMonths.map((code) => MONTH_CODES[code]).sort((a, b) => a - b);
  const startYear = Number(fromDay.slice(0, 4));
  const found = [];
  for (let yearOffset = 0; found.length < count && yearOffset < 6; yearOffset += 1) {
    const year = startYear + yearOffset;
    for (const month of months) {
      if (found.length >= count) break;
      const contract = { symbol, month, year };
      if (compareDays(lastTradingDay(month, year), fromDay) >= 0)
        found.push(Object.freeze(contract));
    }
  }
  return found;
}

/** The month a hedge belongs in on this day, which is the first one not in notice. */
export function frontMonth(commodityId, day, holidays = []) {
  for (const contract of listedContracts(commodityId, day, 8)) {
    if (!isPastFirstNotice(contract, day, holidays)) return contract;
  }
  throw new ConfigError('NO_FRONT_MONTH', `nothing listed for ${commodityId} after ${day}`, {
    commodity: commodityId,
    day,
  });
}

/** Where a position rolls to when its month comes up. */
export function nextContract(commodityId, contract) {
  const commodity = getCommodity(commodityId);
  const months = commodity.deliveryMonths.map((code) => MONTH_CODES[code]).sort((a, b) => a - b);
  const later = months.find((month) => month > contract.month);
  return Object.freeze({
    symbol: contract.symbol,
    month: later ?? months[0],
    year: later ? contract.year : contract.year + 1,
  });
}
