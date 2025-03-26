import { describe, expect, it } from 'vitest';
import { formatMoney } from '../../src/core/money.js';
import {
  chargeablePoints,
  createDryingSchedule,
  dryingCharge,
  ratePointsFor,
  roundPoints,
} from '../../src/weights/drying.js';

const flat = createDryingSchedule({ ratePoints: 450, rounding: 'tenth' });
const tiered = createDryingSchedule({
  id: 'fall-2025',
  rounding: 'whole',
  tiers: [
    { throughPoint: 5, ratePoints: 450 },
    { throughPoint: null, ratePoints: 600 },
  ],
});

describe('building a schedule', () => {
  it('turns a single rate into one open tier', () => {
    expect(flat.tiers).toHaveLength(1);
    expect(flat.tiers[0].throughPoint).toBeNull();
    expect(Object.isFrozen(flat)).toBe(true);
  });

  it('refuses tiers that do not climb', () => {
    expect(() =>
      createDryingSchedule({
        tiers: [
          { throughPoint: 5, ratePoints: 450 },
          { throughPoint: 5, ratePoints: 600 },
        ],
      })
    ).toThrow(/ends at or before/);
  });

  it('refuses an open tier that is not last', () => {
    expect(() =>
      createDryingSchedule({
        tiers: [
          { throughPoint: null, ratePoints: 450 },
          { throughPoint: 8, ratePoints: 600 },
        ],
      })
    ).toThrow(/only the last tier/);
  });

  it('refuses a rounding rule it does not have', () => {
    expect(() => createDryingSchedule({ ratePoints: 450, rounding: 'quarter' })).toThrow(
      /must be one of/
    );
  });
});

describe('rounding the points', () => {
  it('keeps the tenth when that is the rule', () => {
    expect(roundPoints(3.14, 'tenth')).toBe(3.1);
  });

  it('rounds up to the half and to the whole', () => {
    expect(roundPoints(3.1, 'half')).toBe(3.5);
    expect(roundPoints(3.5, 'half')).toBe(3.5);
    expect(roundPoints(3.1, 'whole')).toBe(4);
    expect(roundPoints(3, 'whole')).toBe(3);
  });
});

describe('chargeable points', () => {
  it('starts from the market moisture', () => {
    expect(chargeablePoints(flat, 'corn', 18.4)).toBe(3.4);
    expect(chargeablePoints(flat, 'soybeans', 15)).toBe(2);
  });

  it('charges nothing on a dry load', () => {
    expect(chargeablePoints(flat, 'corn', 14.5)).toBe(0);
  });

  it('gives away the free points first', () => {
    const withFree = createDryingSchedule({ ratePoints: 450, freePoints: 0.5 });
    expect(chargeablePoints(withFree, 'corn', 18.4)).toBe(2.9);
    expect(chargeablePoints(withFree, 'corn', 15.4)).toBe(0);
  });

  it('rounds a hair over eighteen up to a whole four points', () => {
    expect(chargeablePoints(tiered, 'corn', 18.1)).toBe(4);
  });
});

describe('the rate across tiers', () => {
  it('uses one rate on a flat schedule', () => {
    expect(ratePointsFor(flat, 3.4)).toBe(1530);
  });

  it('splits at the tier line', () => {
    expect(ratePointsFor(tiered, 5)).toBe(2250);
    expect(ratePointsFor(tiered, 7)).toBe(3450);
    expect(ratePointsFor(tiered, 0)).toBe(0);
  });
});

describe('the charge on a load', () => {
  it('bills the points per bushel', () => {
    const charge = dryingCharge(flat, {
      commodity: 'corn',
      moisture: 18.4,
      bushelHundredths: 90_000,
    });
    expect(charge.points).toBe(3.4);
    expect(formatMoney(charge.cents)).toBe('137.70');
  });

  it('bills a tiered schedule higher on the wet end', () => {
    const charge = dryingCharge(tiered, {
      commodity: 'corn',
      moisture: 22,
      bushelHundredths: 90_000,
    });
    expect(charge.points).toBe(7);
    expect(formatMoney(charge.cents)).toBe('310.50');
  });

  it('bills nothing on a dry load even with a minimum set', () => {
    const withMinimum = createDryingSchedule({ ratePoints: 450, minimumChargePoints: 200 });
    const charge = dryingCharge(withMinimum, {
      commodity: 'corn',
      moisture: 14,
      bushelHundredths: 90_000,
    });
    expect(charge.cents).toBe(0);
  });

  it('lifts a thin charge to the minimum', () => {
    const withMinimum = createDryingSchedule({ ratePoints: 50, minimumChargePoints: 200 });
    const charge = dryingCharge(withMinimum, {
      commodity: 'corn',
      moisture: 15.1,
      bushelHundredths: 90_000,
    });
    expect(formatMoney(charge.cents)).toBe('18.00');
  });
});
