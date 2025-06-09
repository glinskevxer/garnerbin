import { describe, expect, it } from 'vitest';
import {
  blendCapacity,
  blendFactor,
  blendReadings,
  gradeOfBlend,
  maxBlendIn,
  planBlend,
} from '../../src/inventory/blend.js';

const clean = {
  id: 'B-1',
  bushels: 100_000,
  readings: { testWeight: 57, damagedTotal: 1, heatDamaged: 0, bcfm: 1 },
};

const damaged = {
  id: 'B-4',
  bushels: 50_000,
  readings: { testWeight: 53, damagedTotal: 11, heatDamaged: 0.1, bcfm: 3 },
};

describe('blending readings', () => {
  it('weights each lot by its bushels', () => {
    expect(blendFactor([clean, damaged], 'damagedTotal')).toBe(4.3);
    expect(blendFactor([clean, damaged], 'testWeight')).toBe(55.7);
  });

  it('answers nothing when no lot reported the factor', () => {
    expect(blendFactor([clean], 'splits')).toBeNull();
  });

  it('builds the whole reading set for a commodity', () => {
    expect(Object.keys(blendReadings([clean, damaged], 'corn')).sort()).toEqual([
      'bcfm',
      'damagedTotal',
      'heatDamaged',
      'testWeight',
    ]);
  });

  it('grades the blend', () => {
    expect(gradeOfBlend([clean], 'corn').grade).toBe(1);
    expect(gradeOfBlend([clean, damaged], 'corn').grade).toBe(2);
  });
});

describe('how much will go in', () => {
  it('works the ceiling factors out of the algebra', () => {
    expect(maxBlendIn(clean, damaged, 'damagedTotal', 5)).toBe(66_666);
  });

  it('runs test weight the other way', () => {
    expect(maxBlendIn(clean, damaged, 'testWeight', 54)).toBe(300_000);
  });

  it('says nothing binds when the addition is already inside the limit', () => {
    expect(maxBlendIn(clean, damaged, 'heatDamaged', 0.2)).toBe(Infinity);
  });

  it('says nothing will go in when the base is already outside', () => {
    expect(maxBlendIn(damaged, clean, 'damagedTotal', 5)).toBe(0);
  });

  it('ignores a factor one of the lots never reported', () => {
    const partial = { bushels: 1000, readings: { damagedTotal: 2 } };
    expect(maxBlendIn(clean, partial, 'testWeight', 54)).toBe(Infinity);
  });
});

describe('blend capacity', () => {
  it('takes the smallest answer and names the factor that gave it', () => {
    const capacity = blendCapacity(clean, damaged, 'corn', 2);
    expect(capacity.bushels).toBe(50_000);
    expect(capacity.bindingFactor).toBe('damagedTotal');
  });

  it('is capped by how much of the bad bin there is', () => {
    const plenty = { ...damaged, bushels: 500_000 };
    expect(blendCapacity(clean, plenty, 'corn', 2).bushels).toBe(66_666);
  });

  it('takes everything when nothing binds', () => {
    const nearlyClean = {
      bushels: 20_000,
      readings: { testWeight: 56, damagedTotal: 2, heatDamaged: 0, bcfm: 2 },
    };
    const capacity = blendCapacity(clean, nearlyClean, 'corn', 2);
    expect(capacity.unlimited).toBe(true);
    expect(capacity.bushels).toBe(20_000);
  });
});

describe('planning a blend', () => {
  it('builds the lots and grades the result', () => {
    const plan = planBlend(clean, { ...damaged, bushels: 500_000 }, 'corn', 2);
    expect(plan.bushels).toBe(66_666);
    expect(plan.totalBushels).toBe(166_666);
    expect(plan.grade).toBe(2);
    expect(plan.readings.damagedTotal).toBeLessThanOrEqual(5);
  });

  it('refuses when nothing at all will blend', () => {
    expect(() => planBlend(damaged, clean, 'corn', 2)).toThrow(/no B-1 will make US No. 2/);
  });
});
