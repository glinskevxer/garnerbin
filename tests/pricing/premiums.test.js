import { describe, expect, it } from 'vitest';
import { formatPrice } from '../../src/core/money.js';
import {
  createPremiumSchedule,
  premiumFor,
  scaledFactors,
  scaleTable,
  stepsFrom,
  totalPremium,
  withPremiums,
} from '../../src/pricing/premiums.js';

const schedule = createPremiumSchedule({
  id: 'blair-protein',
  commodity: 'hrw',
  scales: {
    protein: {
      base: 11,
      step: 0.25,
      abovePoints: 300,
      belowPoints: 400,
      ceiling: 13,
      floor: 9,
    },
    testWeight: { base: 60, step: 1, abovePoints: 100, belowPoints: 0 },
  },
});

describe('building a scale', () => {
  it('keeps the factors it was given', () => {
    expect(scaledFactors(schedule).sort()).toEqual(['protein', 'testWeight']);
    expect(Object.isFrozen(schedule.scales.protein)).toBe(true);
  });

  it('mirrors the rate below the base when only one is given', () => {
    const mirrored = createPremiumSchedule({
      id: 'x',
      commodity: 'hrw',
      scales: { protein: { base: 11, abovePoints: 300 } },
    });
    expect(mirrored.scales.protein.belowPoints).toBe(300);
  });

  it('refuses a ceiling under the base or a floor over it', () => {
    expect(() =>
      createPremiumSchedule({
        id: 'x',
        commodity: 'hrw',
        scales: { protein: { base: 11, ceiling: 10 } },
      })
    ).toThrow(/ceiling under its base/);
    expect(() =>
      createPremiumSchedule({
        id: 'x',
        commodity: 'hrw',
        scales: { protein: { base: 11, floor: 12 } },
      })
    ).toThrow(/floor over its base/);
  });

  it('refuses an empty schedule and a factor nobody measures', () => {
    expect(() => createPremiumSchedule({ id: 'x', commodity: 'hrw', scales: {} })).toThrow(
      /at least one scale/
    );
    expect(() =>
      createPremiumSchedule({ id: 'x', commodity: 'hrw', scales: { colour: { base: 1 } } })
    ).toThrow(/not a factor/);
  });
});

describe('counting steps', () => {
  const protein = schedule.scales.protein;

  it('counts whole quarter points either side of the base', () => {
    expect(stepsFrom(protein, 11)).toBe(0);
    expect(stepsFrom(protein, 11.25)).toBe(1);
    expect(stepsFrom(protein, 12)).toBe(4);
    expect(stepsFrom(protein, 10.5)).toBe(-2);
  });

  it('does not pay for part of a step', () => {
    expect(stepsFrom(protein, 11.24)).toBe(0);
    expect(stepsFrom(protein, 11.74)).toBe(2);
    expect(stepsFrom(protein, 10.76)).toBe(0);
  });

  it('stops at the ceiling and the floor', () => {
    expect(stepsFrom(protein, 14)).toBe(8);
    expect(stepsFrom(protein, 13)).toBe(8);
    expect(stepsFrom(protein, 8)).toBe(-8);
  });
});

describe('the premium on a reading', () => {
  it('pays three cents a quarter point over eleven', () => {
    expect(premiumFor(schedule, 'protein', 11.25)).toBe(300);
    expect(premiumFor(schedule, 'protein', 12)).toBe(1200);
    expect(formatPrice(premiumFor(schedule, 'protein', 12))).toBe('0.1200');
  });

  it('takes four cents a quarter point under it', () => {
    expect(premiumFor(schedule, 'protein', 10.5)).toBe(-800);
  });

  it('pays nothing at the base', () => {
    expect(premiumFor(schedule, 'protein', 11)).toBe(0);
  });

  it('pays nothing for a factor the schedule does not scale', () => {
    expect(premiumFor(schedule, 'moisture', 20)).toBe(0);
  });

  it('takes nothing off below a base with no below rate', () => {
    expect(premiumFor(schedule, 'testWeight', 58)).toBe(0);
    expect(premiumFor(schedule, 'testWeight', 62)).toBe(200);
  });
});

describe('the whole premium on a load', () => {
  it('adds every scale that moved', () => {
    const result = totalPremium(schedule, { protein: 12, testWeight: 62, moisture: 12 });
    expect(result.lines).toHaveLength(2);
    expect(result.totalPoints).toBe(1400);
  });

  it('skips a reading nobody took', () => {
    expect(totalPremium(schedule, { protein: 12 }).lines).toHaveLength(1);
  });

  it('nets a premium against a discount', () => {
    const result = totalPremium(schedule, { protein: 10.5, testWeight: 62 });
    expect(result.totalPoints).toBe(-600);
  });

  it('goes on top of the bid', () => {
    expect(withPremiums(58_000, 1400)).toBe(59_400);
  });
});

describe('the bid sheet', () => {
  it('prints a row for each step across a range', () => {
    const rows = scaleTable(schedule, 'protein', 11, 12);
    expect(rows.map((row) => row.value)).toEqual([11, 11.25, 11.5, 11.75, 12]);
    expect(rows.map((row) => row.points)).toEqual([0, 300, 600, 900, 1200]);
  });

  it('refuses a factor with no scale', () => {
    expect(() => scaleTable(schedule, 'moisture', 12, 14)).toThrow(/has no scale for moisture/);
  });
});
