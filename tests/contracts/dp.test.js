import { describe, expect, it } from 'vitest';
import { formatMoney } from '../../src/core/money.js';
import {
  accrualAsOf,
  accruedPoints,
  chargeableDays,
  createDpTerms,
  DAYS_PER_MONTH,
  daysHeld,
  dpCharge,
  firstChargeDay,
  PRORATION,
} from '../../src/contracts/dp.js';

const daily = createDpTerms({ ratePointsPerMonth: 400, freeDays: 15, proration: 'daily' });
const monthly = createDpTerms({ ratePointsPerMonth: 400, freeDays: 15, proration: 'monthly' });

describe('the terms', () => {
  it('takes the two prorations', () => {
    expect(PRORATION).toEqual(['daily', 'monthly']);
    expect(() => createDpTerms({ ratePointsPerMonth: 400, proration: 'weekly' })).toThrow(
      /must be one of/
    );
  });

  it('defaults to daily with no free days', () => {
    const bare = createDpTerms({ ratePointsPerMonth: 400 });
    expect(bare.proration).toBe('daily');
    expect(bare.freeDays).toBe(0);
  });

  it('refuses a negative rate', () => {
    expect(() => createDpTerms({ ratePointsPerMonth: -1 })).toThrow(/not be negative/);
  });
});

describe('counting the days', () => {
  it('counts from delivery to pricing', () => {
    expect(daysHeld('2025-10-09', '2025-12-08')).toBe(60);
    expect(daysHeld('2025-10-09', '2025-10-09')).toBe(0);
  });

  it('refuses a pricing before the delivery', () => {
    expect(() => daysHeld('2025-10-09', '2025-10-01')).toThrow(/is before/);
  });

  it('gives the free days away first', () => {
    expect(chargeableDays(daily, 60)).toBe(45);
    expect(chargeableDays(daily, 10)).toBe(0);
    expect(DAYS_PER_MONTH).toBe(30);
  });
});

describe('what accrues', () => {
  it('prorates to the day', () => {
    expect(accruedPoints(daily, 45)).toBe(400);
    expect(accruedPoints(daily, 60)).toBe(600);
  });

  it('charges a whole month the day the month starts', () => {
    expect(accruedPoints(monthly, 46)).toBe(800);
    expect(accruedPoints(monthly, 45)).toBe(400);
  });

  it('charges the same on the exact month boundary either way', () => {
    expect(accruedPoints(daily, 45)).toBe(accruedPoints(monthly, 45));
  });

  it('charges nothing inside the free days', () => {
    expect(accruedPoints(daily, 15)).toBe(0);
    expect(accruedPoints(monthly, 15)).toBe(0);
  });
});

describe('the charge on a load', () => {
  it('bills the accrued rate on the bushels', () => {
    const charge = dpCharge(daily, {
      bushelHundredths: 500_000,
      deliveredOn: '2025-10-09',
      pricedOn: '2025-12-08',
    });
    expect(charge.days).toBe(60);
    expect(charge.chargeableDays).toBe(45);
    expect(formatMoney(charge.cents)).toBe('300.00');
  });

  it('lifts a thin charge to the minimum', () => {
    const withMinimum = createDpTerms({
      ratePointsPerMonth: 400,
      freeDays: 15,
      minimumPoints: 500,
    });
    const charge = dpCharge(withMinimum, {
      bushelHundredths: 500_000,
      deliveredOn: '2025-10-09',
      pricedOn: '2025-11-01',
    });
    expect(charge.ratePoints).toBe(500);
  });

  it('bills nothing inside the free window', () => {
    const charge = dpCharge(daily, {
      bushelHundredths: 500_000,
      deliveredOn: '2025-10-09',
      pricedOn: '2025-10-20',
    });
    expect(charge.cents).toBe(0);
  });

  it('reports where an unpriced load stands today', () => {
    const standing = accrualAsOf(daily, {
      bushelHundredths: 500_000,
      deliveredOn: '2025-10-09',
      asOf: '2026-01-07',
    });
    expect(standing.days).toBe(90);
    expect(formatMoney(standing.cents)).toBe('500.00');
  });

  it('says which day the charge first bites', () => {
    expect(firstChargeDay(daily, '2025-10-09')).toBe('2025-10-25');
    expect(firstChargeDay(createDpTerms({ ratePointsPerMonth: 400 }), '2025-10-09')).toBe(
      '2025-10-10'
    );
  });
});
