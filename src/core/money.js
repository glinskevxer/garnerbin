import { ArithmeticError } from './errors.js';
import { isInteger, isString } from './assert.js';
import { roundHalfUp } from './numbers.js';

/**
 * Nothing in the settlement path holds money as a float.
 *
 * A price per bushel is an integer count of points, where a point is a ten
 * thousandth of a dollar. The board trades corn in quarter cents, so a quarter
 * cent is 25 points and every quote the desk can post lands on a whole one.
 *
 * A dollar amount is an integer count of cents.
 *
 * A bushel figure is an integer count of hundredths of a bushel, which is what
 * the scale ticket carries after the conversion from pounds.
 */

export const POINTS_PER_DOLLAR = 10_000;
export const POINTS_PER_CENT = 100;
export const QUARTER_CENT_POINTS = 25;
export const BUSHEL_SCALE = 100;

const MAX_POINTS = 100_000_000;
const PRICE_PATTERN = /^-?\d+(\.\d{1,4})?$/;
const BOARD_PATTERN = /^(-?\d+)'([0-7])$/;

export function priceFromDollars(dollars) {
  const points = Math.round(roundHalfUp(dollars * POINTS_PER_DOLLAR, 0));
  return guardPoints(points);
}

export function priceToDollars(points) {
  isInteger(points, 'points');
  return points / POINTS_PER_DOLLAR;
}

function guardPoints(points) {
  if (!Number.isInteger(points) || Math.abs(points) > MAX_POINTS) {
    throw new ArithmeticError('PRICE_OUT_OF_RANGE', `price of ${points} points is not usable`, {
      points,
    });
  }
  return points;
}

/** Parse a plain decimal bid such as 4.6250 or 11.87. */
export function parsePrice(text) {
  isString(text, 'price');
  const trimmed = text.trim().replace(/^\$/, '');
  if (!PRICE_PATTERN.test(trimmed)) {
    throw new ArithmeticError('BAD_PRICE_TEXT', `cannot read ${JSON.stringify(text)} as a price`, {
      text,
    });
  }
  const [whole, fraction = ''] = trimmed.split('.');
  const negative = whole.startsWith('-');
  const padded = fraction.padEnd(4, '0');
  const magnitude = Math.abs(Number(whole)) * POINTS_PER_DOLLAR + Number(padded);
  return guardPoints(negative ? -magnitude : magnitude);
}

/**
 * Parse board notation. Grain futures print cents and eighths, so 462'4 is
 * 462 and four eighths of a cent, which is $4.625 a bushel.
 */
export function parseBoardPrice(text) {
  isString(text, 'board price');
  const match = BOARD_PATTERN.exec(text.trim());
  if (!match) {
    throw new ArithmeticError('BAD_BOARD_TEXT', `${JSON.stringify(text)} is not board notation`, {
      text,
    });
  }
  const cents = Number(match[1]);
  const eighths = Number(match[2]);
  const negative = match[1].startsWith('-');
  const magnitude = Math.abs(cents) * POINTS_PER_CENT + eighths * 12.5;
  if (!Number.isInteger(magnitude)) {
    throw new ArithmeticError('BAD_BOARD_EIGHTH', `${text} is not on a tradeable tick`, { text });
  }
  return guardPoints(negative ? -magnitude : magnitude);
}

export function formatPrice(points, places = 4) {
  isInteger(points, 'points');
  const negative = points < 0;
  const magnitude = Math.abs(points);
  const whole = Math.floor(magnitude / POINTS_PER_DOLLAR);
  const fraction = String(magnitude % POINTS_PER_DOLLAR).padStart(4, '0');
  const shown = places === 0 ? String(whole) : `${whole}.${fraction.slice(0, places)}`;
  return negative ? `-${shown}` : shown;
}

export function formatBoardPrice(points) {
  isInteger(points, 'points');
  const negative = points < 0;
  const magnitude = Math.abs(points);
  const cents = Math.floor(magnitude / POINTS_PER_CENT);
  const remainder = magnitude % POINTS_PER_CENT;
  if (remainder % 12.5 !== 0) {
    throw new ArithmeticError('OFF_TICK', `${formatPrice(points)} is not on an eighth`, { points });
  }
  const shown = `${cents}'${remainder / 12.5}`;
  return negative ? `-${shown}` : shown;
}

export function parseMoney(text) {
  isString(text, 'amount');
  const trimmed = text.trim().replace(/^\$/, '').replace(/,/g, '');
  if (!/^-?\d+(\.\d{1,2})?$/.test(trimmed)) {
    throw new ArithmeticError('BAD_MONEY_TEXT', `cannot read ${JSON.stringify(text)} as money`, {
      text,
    });
  }
  const [whole, fraction = ''] = trimmed.split('.');
  const negative = whole.startsWith('-');
  const magnitude = Math.abs(Number(whole)) * 100 + Number(fraction.padEnd(2, '0'));
  return negative ? -magnitude : magnitude;
}

export function formatMoney(cents, { sign = false, grouped = true } = {}) {
  isInteger(cents, 'cents');
  const negative = cents < 0;
  const magnitude = Math.abs(cents);
  const whole = String(Math.floor(magnitude / 100));
  const grouping = grouped ? whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',') : whole;
  const body = `${grouping}.${String(magnitude % 100).padStart(2, '0')}`;
  if (negative) return `-${body}`;
  return sign ? `+${body}` : body;
}

/** Bushels come in as a decimal and are held as hundredths. */
export function bushelsFromDecimal(value) {
  return Math.round(roundHalfUp(value * BUSHEL_SCALE, 0));
}

export function bushelsToDecimal(hundredths) {
  isInteger(hundredths, 'hundredths');
  return hundredths / BUSHEL_SCALE;
}

export function formatBushels(hundredths) {
  isInteger(hundredths, 'hundredths');
  const negative = hundredths < 0;
  const magnitude = Math.abs(hundredths);
  const whole = String(Math.floor(magnitude / BUSHEL_SCALE)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const body = `${whole}.${String(magnitude % BUSHEL_SCALE).padStart(2, '0')}`;
  return negative ? `-${body}` : body;
}

/**
 * Value a load. Points times hundredths of a bushel lands on cents with the
 * scales cancelling exactly, so the only rounding is the last half cent.
 */
export function extend(pricePoints, bushelHundredths) {
  isInteger(pricePoints, 'pricePoints');
  isInteger(bushelHundredths, 'bushelHundredths');
  const raw = (pricePoints * bushelHundredths) / POINTS_PER_DOLLAR;
  return raw < 0 ? -Math.round(-raw) : Math.round(raw);
}

/** Per bushel charges such as drying and storage run through the same path. */
export function chargePerBushel(ratePoints, bushelHundredths) {
  return extend(ratePoints, bushelHundredths);
}

export function addMoney(...amounts) {
  let total = 0;
  for (const amount of amounts) total += isInteger(amount, 'amount');
  return total;
}
