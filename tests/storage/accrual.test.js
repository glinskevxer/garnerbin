import { describe, expect, it } from 'vitest';
import { formatMoney } from '../../src/core/money.js';
import {
  accruedPoints,
  ageLots,
  agingBucket,
  chargeableDays,
  chargesFrom,
  createStorageTerms,
  DAYS_PER_MONTH,
  PRORATION,
  storageCharge,
} from '../../src/storage/accrual.js';

const terms = createStorageTerms({
  ratePointsPerMonth: 500,
  proration: 'daily',
  freeUntil: '2026-01-01',
});

describe('the terms', () => {
  it('takes the two prorations', () => {
    expect(PRORATION).toEqual(['daily', 'monthly']);
    expect(DAYS_PER_MONTH).toBe(30);
    expect(() => createStorageTerms({ ratePointsPerMonth: 500, proration: 'yearly' })).toThrow(
      /must be one of/
    );
  });

  it('leaves the free date off when there is not one', () => {
    expect(createStorageTerms({ ratePointsPerMonth: 500 }).freeUntil).toBeNull();
  });
});

describe('when rent starts', () => {
  it('gives every harvest load the same free ride', () => {
    expect(chargesFrom(terms, '2025-09-20')).toBe('2026-01-01');
    expect(chargesFrom(terms, '2025-11-30')).toBe('2026-01-01');
  });

  it('takes the later of the free date and the free days', () => {
    const both = createStorageTerms({
      ratePointsPerMonth: 500,
      freeUntil: '2026-01-01',
      freeDays: 30,
    });
    expect(chargesFrom(both, '2025-11-30')).toBe('2026-01-01');
    expect(chargesFrom(both, '2026-01-15')).toBe('2026-02-14');
  });

  it('counts nothing before rent starts', () => {
    expect(chargeableDays(terms, '2025-10-01', '2025-12-31')).toBe(0);
    expect(chargeableDays(terms, '2025-10-01', '2026-01-31')).toBe(30);
  });
});

describe('what accrues', () => {
  it('prorates to the day', () => {
    expect(accruedPoints(terms, 30)).toBe(500);
    expect(accruedPoints(terms, 45)).toBe(750);
    expect(accruedPoints(terms, 0)).toBe(0);
  });

  it('charges a whole month at a time when told to', () => {
    const monthly = createStorageTerms({ ratePointsPerMonth: 500, proration: 'monthly' });
    expect(accruedPoints(monthly, 31)).toBe(1000);
    expect(accruedPoints(monthly, 30)).toBe(500);
  });

  it('stops at the cap', () => {
    const capped = createStorageTerms({ ratePointsPerMonth: 500, capPoints: 2000 });
    expect(accruedPoints(capped, 365)).toBe(2000);
    expect(accruedPoints(capped, 60)).toBe(1000);
  });
});

describe('the charge on a lot', () => {
  it('bills the accrued rate on the bushels', () => {
    const charge = storageCharge(terms, {
      bushelHundredths: 1_000_000,
      storedFrom: '2025-10-15',
      asOf: '2026-03-02',
    });
    expect(charge.chargesFrom).toBe('2026-01-01');
    expect(charge.days).toBe(60);
    expect(formatMoney(charge.cents)).toBe('1,000.00');
  });

  it('bills nothing inside the free period', () => {
    const charge = storageCharge(terms, {
      bushelHundredths: 1_000_000,
      storedFrom: '2025-10-15',
      asOf: '2025-12-15',
    });
    expect(charge.cents).toBe(0);
  });
});

describe('aging', () => {
  it('puts a lot in a bucket', () => {
    expect(agingBucket(0)).toBe('0 to 30');
    expect(agingBucket(30)).toBe('0 to 30');
    expect(agingBucket(31)).toBe('31 to 60');
    expect(agingBucket(200)).toBe('over 180');
  });

  it('adds the lots up by bucket', () => {
    const rows = ageLots(
      [
        { storedFrom: '2026-02-15', bushels: 100_000 },
        { storedFrom: '2026-01-15', bushels: 200_000 },
        { storedFrom: '2025-09-15', bushels: 300_000 },
      ],
      '2026-03-01'
    );
    expect(rows.find((row) => row.bucket === '0 to 30').bushels).toBe(100_000);
    expect(rows.find((row) => row.bucket === '31 to 60').bushels).toBe(200_000);
    expect(rows.find((row) => row.bucket === '91 to 180').bushels).toBe(300_000);
  });

  it('leaves the empty buckets at zero rather than dropping them', () => {
    expect(ageLots([], '2026-03-01')).toHaveLength(5);
  });
});
