import { describe, expect, it } from 'vitest';
import { formatMoney } from '../../src/core/money.js';
import {
  advanceLimit,
  availableToDraw,
  createAdvance,
  DAYS_IN_YEAR,
  DEFAULT_ADVANCE_PERCENT,
  daysOutstanding,
  interestOn,
  isOutstanding,
  marginCallOn,
  payoff,
  repay,
} from '../../src/settlement/advance.js';

const limit = advanceLimit({ bushelHundredths: 1_000_000, marketPoints: 42_000 });

function advance(overrides = {}) {
  return createAdvance({
    id: 'A-77',
    account: 'HALVORSEN',
    day: '2025-10-15',
    principalCents: 200_000,
    annualRate: 0.085,
    against: 'C-1004',
    ...overrides,
  });
}

describe('the limit', () => {
  it('lends a share of the market value', () => {
    expect(DEFAULT_ADVANCE_PERCENT).toBe(70);
    expect(formatMoney(limit.valueCents)).toBe('42,000.00');
    expect(formatMoney(limit.limitCents)).toBe('29,400.00');
  });

  it('takes another percent', () => {
    const tight = advanceLimit({ bushelHundredths: 1_000_000, marketPoints: 42_000, percent: 50 });
    expect(formatMoney(tight.limitCents)).toBe('21,000.00');
  });

  it('refuses a percent over a hundred', () => {
    expect(() =>
      advanceLimit({ bushelHundredths: 1000, marketPoints: 42_000, percent: 120 })
    ).toThrow(/between 0 and 100/);
  });
});

describe('interest', () => {
  it('runs on actual days over three hundred and sixty five', () => {
    expect(DAYS_IN_YEAR).toBe(365);
    expect(daysOutstanding(advance(), '2025-12-15')).toBe(61);
    expect(formatMoney(interestOn(advance(), '2025-12-15'))).toBe('28.41');
  });

  it('is nothing on the day it was drawn', () => {
    expect(interestOn(advance(), '2025-10-15')).toBe(0);
  });

  it('stops on the day it was repaid', () => {
    const repaid = repay(advance(), '2025-12-15');
    expect(interestOn(repaid, '2026-06-01')).toBe(interestOn(advance(), '2025-12-15'));
  });

  it('refuses a day before the advance', () => {
    expect(() => interestOn(advance(), '2025-09-01')).toThrow(/is before A-77 was drawn/);
  });

  it('is nothing at all on a rate of zero', () => {
    expect(interestOn(advance({ annualRate: 0 }), '2026-06-01')).toBe(0);
  });
});

describe('the payoff', () => {
  it('adds interest to the principal', () => {
    const due = payoff(advance(), '2025-12-15');
    expect(due.principalCents).toBe(200_000);
    expect(due.totalCents).toBe(200_000 + due.interestCents);
    expect(due.days).toBe(61);
  });
});

describe('repaying', () => {
  it('marks the advance repaid', () => {
    const repaid = repay(advance(), '2025-12-15');
    expect(isOutstanding(repaid)).toBe(false);
    expect(repaid.repaidOn).toBe('2025-12-15');
  });

  it('refuses to repay twice', () => {
    expect(() => repay(repay(advance(), '2025-12-15'), '2026-01-01')).toThrow(/was repaid on/);
  });

  it('refuses a repayment before the draw', () => {
    expect(() => repay(advance(), '2025-09-01')).toThrow(/is before 2025-10-15/);
  });
});

describe('what is left to draw', () => {
  it('takes the outstanding advances off the limit', () => {
    const standing = availableToDraw(limit, [advance()], '2025-12-15');
    expect(standing.outstandingCents).toBeGreaterThan(200_000);
    expect(formatMoney(standing.availableCents)).toBe('27,371.59');
    expect(standing.overDrawn).toBe(false);
  });

  it('ignores an advance that was repaid', () => {
    const standing = availableToDraw(limit, [repay(advance(), '2025-11-01')], '2025-12-15');
    expect(standing.outstandingCents).toBe(0);
  });

  it('never reports a negative amount left', () => {
    const big = advance({ principalCents: 4_000_000 });
    expect(availableToDraw(limit, [big], '2025-12-15').availableCents).toBe(0);
  });
});

describe('the call', () => {
  it('says how much is left when the grain still covers it', () => {
    const call = marginCallOn(limit, [advance()], '2025-12-15');
    expect(call.called).toBe(false);
    expect(call.line).toContain('left to draw');
  });

  it('calls when the market has fallen under the advance', () => {
    const fallen = advanceLimit({ bushelHundredths: 1_000_000, marketPoints: 25_000 });
    const call = marginCallOn(fallen, [advance({ principalCents: 2_000_000 })], '2025-12-15');
    expect(call.called).toBe(true);
    expect(call.line).toContain('over the limit');
    expect(call.cents).toBeGreaterThan(0);
  });
});
