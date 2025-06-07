import { describe, expect, it } from 'vitest';
import { formatBushels } from '../../src/core/money.js';
import {
  aerationRate,
  BIN_KINDS,
  canAccept,
  capacityOf,
  coolingHours,
  createBin,
  cubicFeet,
  fillPercent,
  headroom,
  isOverfull,
  levelCapacityOf,
  volumes,
} from '../../src/inventory/bins.js';

const upright = createBin({
  id: 'B-3',
  kind: 'upright',
  diameterFeet: 48,
  eaveHeightFeet: 60,
  peakHeightFeet: 12,
  aerationCfm: 9000,
  commodity: 'corn',
});

describe('creating a bin', () => {
  it('takes the three kinds', () => {
    expect(BIN_KINDS).toEqual(['upright', 'hopper', 'flat']);
    expect(() =>
      createBin({ id: 'x', kind: 'silo', diameterFeet: 20, eaveHeightFeet: 40 })
    ).toThrow(/must be one of/);
  });

  it('needs a diameter on a round bin and sides on a flat store', () => {
    expect(() => createBin({ id: 'x', eaveHeightFeet: 40 })).toThrow(/diameterFeet is required/);
    expect(() => createBin({ id: 'x', kind: 'flat', eaveHeightFeet: 20 })).toThrow(
      /lengthFeet is required/
    );
  });

  it('refuses a hopper on a flat bottom bin', () => {
    expect(() =>
      createBin({ id: 'x', diameterFeet: 30, eaveHeightFeet: 40, hopperHeightFeet: 8 })
    ).toThrow(/is a upright bin with a hopper/);
  });
});

describe('capacity from the geometry', () => {
  it('adds the ring and the peak', () => {
    const parts = volumes(upright);
    expect(parts.ring).toBeCloseTo(108_573.44, 1);
    expect(parts.peak).toBeCloseTo(7238.23, 1);
    expect(cubicFeet(upright)).toBeCloseTo(115_811.67, 1);
  });

  it('turns cubic feet into bushels', () => {
    expect(formatBushels(capacityOf(upright))).toBe('93,062.08');
  });

  it('reads lower with nothing above the eave', () => {
    expect(levelCapacityOf(upright)).toBeLessThan(capacityOf(upright));
  });

  it('measures a flat store on its footprint', () => {
    const flat = createBin({
      id: 'F-1',
      kind: 'flat',
      lengthFeet: 200,
      widthFeet: 100,
      eaveHeightFeet: 20,
    });
    expect(formatBushels(capacityOf(flat))).toBe('321,425.58');
  });

  it('counts the hopper as part of a hopper bin', () => {
    const hopper = createBin({
      id: 'H-1',
      kind: 'hopper',
      diameterFeet: 21,
      eaveHeightFeet: 30,
      hopperHeightFeet: 9,
    });
    expect(capacityOf(hopper)).toBeGreaterThan(
      capacityOf(createBin({ id: 'H-2', kind: 'hopper', diameterFeet: 21, eaveHeightFeet: 30 }))
    );
  });
});

describe('how full it is', () => {
  it('reports the headroom and the percent', () => {
    expect(fillPercent(upright, capacityOf(upright))).toBe(100);
    expect(fillPercent(upright, 0)).toBe(0);
    expect(headroom(upright, capacityOf(upright))).toBe(0);
  });

  it('never reports negative headroom', () => {
    expect(headroom(upright, capacityOf(upright) + 100_000)).toBe(0);
    expect(isOverfull(upright, capacityOf(upright) + 1)).toBe(true);
  });
});

describe('accepting a load', () => {
  it('takes a load that fits', () => {
    expect(canAccept(upright, { commodity: 'corn', bushels: 100_000 }).ok).toBe(true);
  });

  it('refuses the wrong grain', () => {
    const result = canAccept(upright, { commodity: 'soybeans', bushels: 100_000 });
    expect(result.ok).toBe(false);
    expect(result.problems[0]).toBe('B-3 is holding corn');
  });

  it('refuses a load that will not fit on top of what is there', () => {
    const result = canAccept(upright, {
      commodity: 'corn',
      bushels: 500_000,
      holding: capacityOf(upright) - 100_000,
    });
    expect(result.ok).toBe(false);
    expect(result.problems[0]).toContain('has room for 1,000.00');
  });

  it('takes anything into an empty unassigned bin', () => {
    const spare = createBin({ id: 'B-9', diameterFeet: 30, eaveHeightFeet: 40 });
    expect(canAccept(spare, { commodity: 'hrw', bushels: 100_000 }).ok).toBe(true);
  });
});

describe('aeration', () => {
  it('reads the fan against what is in the bin', () => {
    expect(aerationRate(upright, 9_000_000)).toBe(0.1);
    expect(aerationRate(upright, 0)).toBe(0);
  });

  it('turns the rate into hours for a cooling front', () => {
    expect(coolingHours(upright, 9_000_000)).toBe(15);
  });

  it('refuses to guess on a bin with no fan', () => {
    const unaerated = createBin({ id: 'B-8', diameterFeet: 30, eaveHeightFeet: 40 });
    expect(() => coolingHours(unaerated, 100_000)).toThrow(/has no fan/);
  });
});
