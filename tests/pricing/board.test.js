import { describe, expect, it } from 'vitest';
import {
  codeForMonth,
  firstNoticeDay,
  formatContract,
  frontMonth,
  isExpired,
  isPastFirstNotice,
  lastTradingDay,
  listedContracts,
  MONTH_CODES,
  monthForCode,
  nextContract,
  parseContract,
} from '../../src/pricing/board.js';

describe('month codes', () => {
  it('maps the twelve letters', () => {
    expect(Object.keys(MONTH_CODES)).toHaveLength(12);
    expect(monthForCode('Z')).toBe(12);
    expect(monthForCode('H')).toBe(3);
    expect(codeForMonth(12)).toBe('Z');
    expect(codeForMonth(7)).toBe('N');
  });

  it('refuses a letter that is not a month', () => {
    expect(() => monthForCode('A')).toThrow(/must be one of/);
    expect(() => codeForMonth(13)).toThrow(/between 1 and 12/);
  });
});

describe('contract symbols', () => {
  it('reads the way the broker writes them', () => {
    expect(parseContract('ZCZ25')).toEqual({ symbol: 'ZC', code: 'Z', month: 12, year: 2025 });
    expect(parseContract('kek26').symbol).toBe('KE');
  });

  it('writes them back', () => {
    expect(formatContract({ symbol: 'ZC', month: 12, year: 2025 })).toBe('ZCZ25');
    expect(formatContract({ symbol: 'ZS', month: 11, year: 2026 })).toBe('ZSX26');
  });

  it('refuses something that is not a contract month', () => {
    expect(() => parseContract('ZCA25')).toThrow(/not a contract month/);
    expect(() => parseContract('december corn')).toThrow(/not a contract month/);
  });
});

describe('the two dates that matter', () => {
  it('puts last trading day before the fifteenth', () => {
    expect(lastTradingDay(12, 2025)).toBe('2025-12-12');
    expect(lastTradingDay(3, 2026)).toBe('2026-03-13');
  });

  it('walks back past a holiday on the fourteenth', () => {
    expect(lastTradingDay(12, 2025, ['2025-12-12'])).toBe('2025-12-11');
  });

  it('puts first notice day on the last business day of the month before', () => {
    expect(firstNoticeDay(12, 2025)).toBe('2025-11-28');
    expect(firstNoticeDay(3, 2026)).toBe('2026-02-27');
  });

  it('walks first notice day back off a holiday', () => {
    expect(firstNoticeDay(12, 2025, ['2025-11-28'])).toBe('2025-11-27');
  });

  it('knows when a contract is in notice and when it is done', () => {
    const december = parseContract('ZCZ25');
    expect(isPastFirstNotice(december, '2025-11-27')).toBe(false);
    expect(isPastFirstNotice(december, '2025-11-28')).toBe(true);
    expect(isExpired(december, '2025-12-12')).toBe(false);
    expect(isExpired(december, '2025-12-13')).toBe(true);
  });
});

describe('the listed board', () => {
  it('lists corn in the months corn trades', () => {
    const listed = listedContracts('corn', '2025-10-01', 4);
    expect(listed.map((contract) => formatContract(contract))).toEqual([
      'ZCZ25',
      'ZCF26',
      'ZCH26',
      'ZCK26',
    ]);
  });

  it('lists soybeans in their own months', () => {
    const listed = listedContracts('soybeans', '2025-10-01', 3);
    expect(listed.map((contract) => formatContract(contract))).toEqual(['ZSX25', 'ZSF26', 'ZSH26']);
  });

  it('sends milo to the corn board', () => {
    expect(listedContracts('sorghum', '2025-10-01', 1)[0].symbol).toBe('ZC');
  });

  it('picks a front month that is not already in notice', () => {
    expect(formatContract(frontMonth('corn', '2025-10-01'))).toBe('ZCZ25');
    expect(formatContract(frontMonth('corn', '2025-11-28'))).toBe('ZCF26');
  });

  it('rolls to the next listed month and over the turn of the year', () => {
    expect(formatContract(nextContract('corn', parseContract('ZCZ25')))).toBe('ZCF26');
    expect(formatContract(nextContract('corn', parseContract('ZCU25')))).toBe('ZCZ25');
    expect(formatContract(nextContract('soybeans', parseContract('ZSX25')))).toBe('ZSF26');
  });
});
