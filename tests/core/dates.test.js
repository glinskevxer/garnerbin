import { describe, expect, it } from 'vitest';
import {
  addBusinessDays,
  addDays,
  addMonths,
  assertDay,
  compareDays,
  cropYear,
  dayParts,
  daysBetween,
  eachDay,
  earliest,
  endOfMonth,
  isBusinessDay,
  isWeekend,
  isWithin,
  latest,
  monthKey,
  nextBusinessDay,
  startOfMonth,
  weekdayOf,
} from '../../src/core/dates.js';

describe('assertDay', () => {
  it('takes a real calendar day', () => {
    expect(assertDay('2025-02-28')).toBe('2025-02-28');
    expect(assertDay('2024-02-29')).toBe('2024-02-29');
  });

  it('refuses a day that is not on the calendar', () => {
    expect(() => assertDay('2025-02-29')).toThrow(/not a day on the calendar/);
    expect(() => assertDay('2025-13-01')).toThrow(/not a day on the calendar/);
  });

  it('refuses a shape it cannot read', () => {
    expect(() => assertDay('3/14/2025')).toThrow(/must be YYYY-MM-DD/);
    expect(() => assertDay('2025-3-14')).toThrow(/must be YYYY-MM-DD/);
  });

  it('splits a day into parts', () => {
    expect(dayParts('2025-09-01')).toEqual({ year: 2025, month: 9, date: 1 });
  });
});

describe('day arithmetic', () => {
  it('adds and subtracts days across a month end', () => {
    expect(addDays('2025-01-31', 1)).toBe('2025-02-01');
    expect(addDays('2025-03-01', -1)).toBe('2025-02-28');
    expect(addDays('2024-03-01', -1)).toBe('2024-02-29');
  });

  it('counts the days between two dates', () => {
    expect(daysBetween('2025-01-01', '2025-12-31')).toBe(364);
    expect(daysBetween('2025-12-31', '2025-01-01')).toBe(-364);
    expect(daysBetween('2025-06-05', '2025-06-05')).toBe(0);
  });

  it('crosses the daylight saving change without losing a day', () => {
    expect(daysBetween('2025-03-08', '2025-03-10')).toBe(2);
    expect(addDays('2025-03-08', 1)).toBe('2025-03-09');
    expect(daysBetween('2025-11-01', '2025-11-03')).toBe(2);
  });

  it('orders days', () => {
    expect(compareDays('2025-01-01', '2025-01-02')).toBe(-1);
    expect(compareDays('2025-01-02', '2025-01-01')).toBe(1);
    expect(compareDays('2025-01-01', '2025-01-01')).toBe(0);
    expect(earliest(['2025-05-01', '2025-01-09', '2025-09-30'])).toBe('2025-01-09');
    expect(latest(['2025-05-01', '2025-01-09', '2025-09-30'])).toBe('2025-09-30');
  });
});

describe('months', () => {
  it('finds the ends of a month', () => {
    expect(startOfMonth('2025-07-17')).toBe('2025-07-01');
    expect(endOfMonth('2025-07-17')).toBe('2025-07-31');
    expect(endOfMonth('2025-02-05')).toBe('2025-02-28');
    expect(endOfMonth('2024-02-05')).toBe('2024-02-29');
  });

  it('clamps when a month is short', () => {
    expect(addMonths('2025-01-31', 1)).toBe('2025-02-28');
    expect(addMonths('2025-03-31', -1)).toBe('2025-02-28');
    expect(addMonths('2025-10-15', 3)).toBe('2026-01-15');
  });

  it('keys a month', () => {
    expect(monthKey('2025-07-17')).toBe('2025-07');
  });
});

describe('business days', () => {
  const thanksgiving = ['2025-11-27'];

  it('knows the weekend', () => {
    expect(weekdayOf('2025-11-29')).toBe(6);
    expect(isWeekend('2025-11-29')).toBe(true);
    expect(isWeekend('2025-11-28')).toBe(false);
  });

  it('skips the holiday as well as the weekend', () => {
    expect(isBusinessDay('2025-11-27', thanksgiving)).toBe(false);
    expect(nextBusinessDay('2025-11-26', thanksgiving)).toBe('2025-11-28');
    expect(nextBusinessDay('2025-11-28', thanksgiving)).toBe('2025-12-01');
  });

  it('walks business days in both directions', () => {
    expect(addBusinessDays('2025-11-26', 2, thanksgiving)).toBe('2025-12-01');
    expect(addBusinessDays('2025-12-01', -2, thanksgiving)).toBe('2025-11-26');
    expect(addBusinessDays('2025-11-26', 0)).toBe('2025-11-26');
  });
});

describe('crop year', () => {
  it('rolls corn on the first of September', () => {
    expect(cropYear('2025-09-01', 9)).toEqual({
      label: '2025/26',
      start: '2025-09-01',
      end: '2026-08-31',
    });
    expect(cropYear('2025-08-31', 9).label).toBe('2024/25');
  });

  it('rolls wheat on the first of June', () => {
    expect(cropYear('2025-06-01', 6).label).toBe('2025/26');
    expect(cropYear('2025-05-31', 6).start).toBe('2024-06-01');
  });

  it('pads the second year past the turn of the century', () => {
    expect(cropYear('2099-09-15', 9).label).toBe('2099/00');
  });
});

describe('ranges', () => {
  it('tells whether a day is inside a window', () => {
    expect(isWithin('2025-10-15', '2025-10-01', '2025-11-30')).toBe(true);
    expect(isWithin('2025-10-01', '2025-10-01', '2025-11-30')).toBe(true);
    expect(isWithin('2025-12-01', '2025-10-01', '2025-11-30')).toBe(false);
  });

  it('walks a short range', () => {
    expect(eachDay('2025-01-01', '2025-01-04')).toEqual([
      '2025-01-01',
      '2025-01-02',
      '2025-01-03',
      '2025-01-04',
    ]);
  });

  it('refuses a backward or oversized range', () => {
    expect(() => eachDay('2025-02-01', '2025-01-01')).toThrow(/is after/);
    expect(() => eachDay('2025-01-01', '2035-01-01')).toThrow(/past the limit/);
  });
});
