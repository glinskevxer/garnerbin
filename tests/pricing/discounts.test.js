import { describe, expect, it } from 'vitest';
import { formatPrice } from '../../src/core/money.js';
import {
  bandFor,
  createDiscountSchedule,
  discountedFactors,
  discountFor,
  netPrice,
  totalDiscount,
} from '../../src/pricing/discounts.js';

const schedule = createDiscountSchedule({
  id: 'rush-creek-2025',
  commodity: 'corn',
  effective: '2025-09-01',
  factors: {
    testWeight: {
      bands: [
        { from: 0, to: 52, points: 1500 },
        { from: 52, to: 54, pointsPerUnit: 100, step: 1 },
        { from: 54, to: null, points: 0 },
      ],
    },
    damagedTotal: {
      bands: [
        { from: 0, to: 5, points: 0 },
        { from: 5, to: null, pointsPerUnit: 100, step: 1 },
      ],
    },
    bcfm: {
      bands: [
        { from: 0, to: 3, points: 0 },
        { from: 3, to: null, pointsPerUnit: 50, step: 1 },
      ],
    },
  },
});

describe('building a schedule', () => {
  it('keeps the factors it was given', () => {
    expect(discountedFactors(schedule).sort()).toEqual(['bcfm', 'damagedTotal', 'testWeight']);
    expect(Object.isFrozen(schedule)).toBe(true);
  });

  it('refuses a hole between bands', () => {
    expect(() =>
      createDiscountSchedule({
        id: 'holed',
        commodity: 'corn',
        factors: {
          damagedTotal: {
            bands: [
              { from: 0, to: 5, points: 0 },
              { from: 6, to: null, points: 100 },
            ],
          },
        },
      })
    ).toThrow(/has a hole before band 1/);
  });

  it('refuses a schedule that does not cover its worst readings', () => {
    expect(() =>
      createDiscountSchedule({
        id: 'closed',
        commodity: 'corn',
        factors: { damagedTotal: { bands: [{ from: 0, to: 5, points: 0 }] } },
      })
    ).toThrow(/does not cover its worst readings/);
  });

  it('refuses an inverted band', () => {
    expect(() =>
      createDiscountSchedule({
        id: 'backwards',
        commodity: 'corn',
        factors: { damagedTotal: { bands: [{ from: 5, to: 2, points: 0 }] } },
      })
    ).toThrow(/ends at or before it starts/);
  });

  it('refuses a factor nobody measures', () => {
    expect(() =>
      createDiscountSchedule({
        id: 'odd',
        commodity: 'corn',
        factors: { colour: { bands: [{ from: 0, to: null, points: 0 }] } },
      })
    ).toThrow(/not a factor/);
  });
});

describe('finding the band', () => {
  it('puts a reading in the band that contains it', () => {
    expect(bandFor(schedule, 'testWeight', 55).points).toBe(0);
    expect(bandFor(schedule, 'testWeight', 54).points).toBe(0);
    expect(bandFor(schedule, 'testWeight', 53.9).pointsPerUnit).toBe(100);
    expect(bandFor(schedule, 'testWeight', 51).points).toBe(1500);
  });

  it('answers nothing for a factor the schedule does not discount', () => {
    expect(bandFor(schedule, 'moisture', 18)).toBeNull();
  });
});

describe('the discount on one reading', () => {
  it('takes nothing off a load inside the free band', () => {
    expect(discountFor(schedule, 'damagedTotal', 4.9)).toBe(0);
    expect(discountFor(schedule, 'testWeight', 56)).toBe(0);
  });

  it('steps a cent for each whole point over the line', () => {
    expect(discountFor(schedule, 'damagedTotal', 5.1)).toBe(100);
    expect(discountFor(schedule, 'damagedTotal', 6)).toBe(100);
    expect(discountFor(schedule, 'damagedTotal', 6.1)).toBe(200);
  });

  it('steps a light load down toward the flat band', () => {
    expect(discountFor(schedule, 'testWeight', 53.5)).toBe(200);
    expect(discountFor(schedule, 'testWeight', 52)).toBe(0);
  });

  it('takes the flat rate once the reading falls past every step', () => {
    expect(discountFor(schedule, 'testWeight', 50)).toBe(1500);
  });

  it('takes nothing for a factor with no bands', () => {
    expect(discountFor(schedule, 'moisture', 22)).toBe(0);
  });
});

describe('the whole discount on a load', () => {
  it('lists a line for every factor that earned one', () => {
    const result = totalDiscount(schedule, {
      testWeight: 53.2,
      damagedTotal: 7.5,
      bcfm: 4.4,
      moisture: 18,
    });
    expect(result.lines.map((line) => line.factor)).toEqual(['testWeight', 'damagedTotal', 'bcfm']);
    expect(result.totalPoints).toBe(200 + 300 + 100);
  });

  it('leaves out the factors that cost nothing', () => {
    const result = totalDiscount(schedule, { testWeight: 56, damagedTotal: 2, bcfm: 1 });
    expect(result.lines).toEqual([]);
    expect(result.totalPoints).toBe(0);
  });

  it('skips a factor the sample never reported', () => {
    const result = totalDiscount(schedule, { damagedTotal: 7.5 });
    expect(result.lines).toHaveLength(1);
  });

  it('comes off the bid', () => {
    expect(formatPrice(netPrice(42_750, 600))).toBe('4.2150');
  });
});
