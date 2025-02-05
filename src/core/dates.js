import { ConfigError } from './errors.js';
import { isInteger, isString } from './assert.js';

/**
 * A day at the elevator is a calendar day on the ticket, not an instant. Every
 * date in the office system is the string YYYY-MM-DD and every calculation runs
 * through UTC, so a settlement worked out in Kansas in November comes out the
 * same as one worked out on a laptop set to Auckland.
 */

const DAY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const MS_PER_DAY = 86_400_000;

export function assertDay(day, name = 'day') {
  isString(day, name);
  const match = DAY_PATTERN.exec(day);
  if (!match) {
    throw new ConfigError('BAD_DAY', `${name} must be YYYY-MM-DD, got ${JSON.stringify(day)}`, {
      field: name,
      value: day,
    });
  }
  const [, year, month, date] = match.map(Number);
  const stamp = Date.UTC(year, month - 1, date);
  const back = new Date(stamp);
  if (
    back.getUTCFullYear() !== year ||
    back.getUTCMonth() !== month - 1 ||
    back.getUTCDate() !== date
  ) {
    throw new ConfigError('NO_SUCH_DAY', `${day} is not a day on the calendar`, { value: day });
  }
  return day;
}

export function dayParts(day) {
  assertDay(day);
  return {
    year: Number(day.slice(0, 4)),
    month: Number(day.slice(5, 7)),
    date: Number(day.slice(8, 10)),
  };
}

function stampOf(day) {
  const { year, month, date } = dayParts(day);
  return Date.UTC(year, month - 1, date);
}

function dayOf(stamp) {
  return new Date(stamp).toISOString().slice(0, 10);
}

export function addDays(day, count) {
  isInteger(count, 'count');
  return dayOf(stampOf(day) + count * MS_PER_DAY);
}

export function daysBetween(from, to) {
  return Math.round((stampOf(to) - stampOf(from)) / MS_PER_DAY);
}

export function compareDays(a, b) {
  assertDay(a, 'a');
  assertDay(b, 'b');
  if (a < b) return -1;
  return a > b ? 1 : 0;
}

export function earliest(days) {
  return days.reduce((best, day) => (compareDays(day, best) < 0 ? day : best));
}

export function latest(days) {
  return days.reduce((best, day) => (compareDays(day, best) > 0 ? day : best));
}

export function startOfMonth(day) {
  const { year, month } = dayParts(day);
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-01`;
}

export function endOfMonth(day) {
  const { year, month } = dayParts(day);
  return dayOf(Date.UTC(year, month, 0));
}

/** Add months and clamp, so the last of January plus one month is the last of February. */
export function addMonths(day, count) {
  isInteger(count, 'count');
  const { year, month, date } = dayParts(day);
  const target = new Date(Date.UTC(year, month - 1 + count, 1));
  const lastDate = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)
  ).getUTCDate();
  return dayOf(Date.UTC(target.getUTCFullYear(), target.getUTCMonth(), Math.min(date, lastDate)));
}

export function monthKey(day) {
  return day.slice(0, 7);
}

export function weekdayOf(day) {
  return new Date(stampOf(day)).getUTCDay();
}

export function isWeekend(day) {
  const weekday = weekdayOf(day);
  return weekday === 0 || weekday === 6;
}

export function isBusinessDay(day, holidays = []) {
  return !isWeekend(day) && !holidays.includes(assertDay(day));
}

export function nextBusinessDay(day, holidays = []) {
  let cursor = addDays(day, 1);
  while (!isBusinessDay(cursor, holidays)) cursor = addDays(cursor, 1);
  return cursor;
}

export function addBusinessDays(day, count, holidays = []) {
  isInteger(count, 'count');
  const step = count < 0 ? -1 : 1;
  let remaining = Math.abs(count);
  let cursor = assertDay(day);
  while (remaining > 0) {
    cursor = addDays(cursor, step);
    if (isBusinessDay(cursor, holidays)) remaining -= 1;
  }
  return cursor;
}

export function isWithin(day, from, to) {
  return compareDays(day, from) >= 0 && compareDays(day, to) <= 0;
}

/**
 * The crop year. Corn and soybeans roll on the first of September, wheat on the
 * first of June, and the label is the pair of years the way the office writes
 * it on the storage tickets.
 */
export function cropYear(day, startMonth) {
  isInteger(startMonth, 'startMonth');
  const { year, month } = dayParts(day);
  const beginYear = month >= startMonth ? year : year - 1;
  const start = `${beginYear}-${String(startMonth).padStart(2, '0')}-01`;
  const end = addDays(addMonths(start, 12), -1);
  return { label: `${beginYear}/${String((beginYear + 1) % 100).padStart(2, '0')}`, start, end };
}

/** Walk a range of days, with a ceiling so a bad range cannot spin forever. */
export function eachDay(from, to, limit = 1100) {
  const span = daysBetween(from, to);
  if (span < 0) {
    throw new ConfigError('BACKWARD_RANGE', `${from} is after ${to}`, { from, to });
  }
  if (span + 1 > limit) {
    throw new ConfigError('RANGE_TOO_LONG', `${span + 1} days is past the limit of ${limit}`, {
      from,
      to,
      limit,
    });
  }
  const days = [];
  for (let offset = 0; offset <= span; offset += 1) days.push(addDays(from, offset));
  return days;
}
