import { describe, expect, it } from 'vitest';
import { formatBushels } from '../../src/core/money.js';
import { capacityOf, createBin } from '../../src/inventory/bins.js';
import {
  ANGLE_OF_REPOSE,
  assertRoom,
  daysUntilFull,
  pileDiameterFor,
  pileFor,
  planFor,
  renderSpace,
  spacePlan,
} from '../../src/inventory/space.js';

const cornBin = createBin({ id: 'B-1', diameterFeet: 48, eaveHeightFeet: 60, commodity: 'corn' });
const beanBin = createBin({
  id: 'B-3',
  diameterFeet: 36,
  eaveHeightFeet: 48,
  commodity: 'soybeans',
});
const spare = createBin({ id: 'B-2', diameterFeet: 48, eaveHeightFeet: 60 });

function holdings(overrides = {}) {
  return [
    { bin: cornBin, bushels: overrides.corn ?? 0, commodity: 'corn' },
    { bin: beanBin, bushels: overrides.beans ?? 100_000, commodity: 'soybeans' },
    { bin: spare, bushels: 0, commodity: null },
  ];
}

describe('the space plan', () => {
  it('counts the free space in the bins the grain can go in', () => {
    const plan = spacePlan({ commodity: 'corn', holdings: holdings(), expectedBushels: 100_000 });
    expect(plan.freeBushels).toBe(capacityOf(cornBin) + capacityOf(spare));
    expect(plan.enough).toBe(true);
  });

  it('does not count a bin holding something else', () => {
    const plan = spacePlan({ commodity: 'corn', holdings: holdings(), expectedBushels: 0 });
    const beans = plan.rows.find((row) => row.bin === 'B-3');
    expect(beans.free).toBe(0);
    expect(beans.usable).toBe(false);
    expect(beans.reason).toBe('holding soybeans');
    expect(plan.blockedBushels).toBe(capacityOf(beanBin));
  });

  it('takes what is already in a bin off its free space', () => {
    const plan = spacePlan({
      commodity: 'corn',
      holdings: holdings({ corn: 5_000_000 }),
      expectedBushels: 0,
    });
    expect(plan.rows.find((row) => row.bin === 'B-1').free).toBe(capacityOf(cornBin) - 5_000_000);
  });

  it('says how short it is', () => {
    const plan = spacePlan({
      commodity: 'corn',
      holdings: holdings(),
      expectedBushels: 40_000_000,
    });
    expect(plan.enough).toBe(false);
    expect(plan.shortBushels).toBe(40_000_000 - plan.freeBushels);
  });

  it('refuses a plan with no bins', () => {
    expect(() => spacePlan({ commodity: 'corn', holdings: [] })).toThrow(/at least 1/);
  });

  it('throws only when asked to assert there is room', () => {
    const tight = spacePlan({
      commodity: 'corn',
      holdings: holdings(),
      expectedBushels: 40_000_000,
    });
    expect(() => assertRoom(tight)).toThrow(/short/);
    expect(assertRoom(spacePlan({ commodity: 'corn', holdings: holdings() }))).toBe(0);
  });
});

describe('how long the space lasts', () => {
  it('divides the free space by the daily receipts', () => {
    expect(daysUntilFull(1_000_000, 100_000)).toBe(10);
  });

  it('refuses a day of nothing', () => {
    expect(() => daysUntilFull(1_000_000, 0)).toThrow(/greater than zero/);
  });
});

describe('a ground pile', () => {
  it('stands at the angle of repose for the grain', () => {
    expect(ANGLE_OF_REPOSE.corn).toBe(23);
    const pile = pileFor('corn', 200);
    expect(pile.heightFeet).toBeCloseTo(42.45, 1);
    expect(pile.bushels).toBeGreaterThan(0);
  });

  it('stands taller for a grain with a steeper angle', () => {
    expect(pileFor('hrw', 200).heightFeet).toBeGreaterThan(pileFor('corn', 200).heightFeet);
  });

  it('works the diameter back out of the bushels', () => {
    const pile = pileFor('corn', 200);
    expect(pileDiameterFor('corn', pile.bushels)).toBeCloseTo(200, 0);
  });

  it('refuses a pile of nothing', () => {
    expect(() => pileFor('corn', 0)).toThrow(/greater than zero/);
    expect(() => pileDiameterFor('corn', 0)).toThrow(/greater than zero/);
  });
});

describe('planning with a pile', () => {
  it('sizes a pile for what will not fit', () => {
    const plan = planFor({
      commodity: 'corn',
      holdings: holdings(),
      expectedBushels: 40_000_000,
    });
    expect(plan.pile).not.toBeNull();
    expect(plan.pile.bushels).toBeGreaterThan(plan.shortBushels * 0.95);
  });

  it('needs no pile when there is room', () => {
    expect(
      planFor({ commodity: 'corn', holdings: holdings(), expectedBushels: 1000 }).pile
    ).toBeNull();
  });

  it('says either there is room or how big a pile it takes', () => {
    expect(renderSpace(planFor({ commodity: 'corn', holdings: holdings() }))).toContain(
      'There is room.'
    );
    const short = renderSpace(
      planFor({ commodity: 'corn', holdings: holdings(), expectedBushels: 40_000_000 })
    );
    expect(short).toContain('Short');
    expect(short).toContain('feet across');
    expect(short).toContain(formatBushels(0).slice(0, 1));
  });
});
