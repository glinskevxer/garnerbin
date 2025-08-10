import { describe, expect, it } from 'vitest';
import {
  assertTakes,
  binOf,
  discountsFor,
  dryingFor,
  HOUSE_SCHEMA,
  houseSummary,
  loadHouse,
  takes,
} from '../../src/config/house.js';

function document(overrides = {}) {
  return {
    name: 'Rush Creek Grain',
    commodities: ['corn', 'soybeans', 'hrw'],
    shrinkFactor: 1.4,
    holidays: ['2025-11-27', '2025-12-25'],
    bins: [
      { id: 'B-1', diameterFeet: 48, eaveHeightFeet: 60, peakHeightFeet: 12, commodity: 'corn' },
      { id: 'B-2', diameterFeet: 30, eaveHeightFeet: 40 },
    ],
    drying: { corn: { ratePoints: 450, rounding: 'tenth' } },
    discounts: {
      corn: {
        factors: {
          damagedTotal: {
            bands: [
              { from: 0, to: 5, points: 0 },
              { from: 5, to: null, pointsPerUnit: 100, step: 1 },
            ],
          },
        },
      },
    },
    storage: { ratePointsPerMonth: 500, freeUntil: '2026-01-01' },
    delayedPrice: { ratePointsPerMonth: 400, freeDays: 15 },
    assessments: [{ checkoffFor: 'corn' }],
    ...overrides,
  };
}

describe('loading a house', () => {
  const house = loadHouse(document());

  it('builds the bins and the schedules', () => {
    expect(house.bins).toHaveLength(2);
    expect(house.bins[0].id).toBe('B-1');
    expect(dryingFor(house, 'corn').tiers[0].ratePoints).toBe(450);
    expect(discountsFor(house, 'corn').commodity).toBe('corn');
  });

  it('keeps the terms it was given', () => {
    expect(house.storage.freeUntil).toBe('2026-01-01');
    expect(house.delayedPrice.freeDays).toBe(15);
    expect(house.shrinkFactor).toBe(1.4);
  });

  it('builds the commodity checkoff from a short entry', () => {
    expect(house.assessments[0].id).toBe('corn-checkoff');
    expect(house.assessments[0].kind).toBe('perBushel');
  });

  it('takes an assessment written out in full', () => {
    const custom = loadHouse(
      document({ assessments: [{ id: 'load', label: 'Load out', kind: 'perBushel', points: 300 }] })
    );
    expect(custom.assessments[0].points).toBe(300);
  });

  it('freezes what it built', () => {
    expect(Object.isFrozen(house)).toBe(true);
    expect(Object.isFrozen(house.bins)).toBe(true);
  });

  it('defaults the shrink factor and the handling percent', () => {
    const bare = loadHouse({
      name: 'Kell Junction',
      commodities: ['corn'],
      bins: [{ id: 'B-1', diameterFeet: 20, eaveHeightFeet: 30 }],
    });
    expect(bare.shrinkFactor).toBe(1.4);
    expect(bare.handlingPercent).toBe(0);
    expect(bare.storage).toBeNull();
    expect(dryingFor(bare, 'corn')).toBeNull();
  });
});

describe('what the house file refuses', () => {
  it('names every problem at once', () => {
    try {
      loadHouse({ commodities: 'corn' });
    } catch (err) {
      expect(err.code).toBe('BAD_HOUSE_FILE');
      expect(err.details.errors).toContain('name is required');
      expect(err.details.errors).toContain('commodities must be a array');
    }
  });

  it('refuses a commodity it does not know', () => {
    expect(() => loadHouse(document({ commodities: ['oats'] }))).toThrow(/must be one of/);
  });

  it('refuses a house that takes nothing', () => {
    expect(() => loadHouse(document({ commodities: [] }))).toThrow(/has to take something/);
  });

  it('refuses a shrink factor outside the sane range', () => {
    expect(() => loadHouse(document({ shrinkFactor: 3 }))).toThrow(/at most 2/);
  });

  it('refuses a holiday that is not a day', () => {
    expect(() => loadHouse(document({ holidays: ['christmas'] }))).toThrow(/must be a day/);
  });

  it('refuses a field nobody declared', () => {
    expect(() => loadHouse(document({ colour: 'red' }))).toThrow(/not a field here/);
  });

  it('declares every field the loader reads', () => {
    expect(Object.keys(HOUSE_SCHEMA)).toContain('delayedPrice');
  });
});

describe('reading a house', () => {
  const house = loadHouse(document());

  it('finds a bin and says what it has when it cannot', () => {
    expect(binOf(house, 'B-2').id).toBe('B-2');
    try {
      binOf(house, 'B-9');
    } catch (err) {
      expect(err.details.bins).toEqual(['B-1', 'B-2']);
    }
  });

  it('says what it takes', () => {
    expect(takes(house, 'corn')).toBe(true);
    expect(takes(house, 'sorghum')).toBe(false);
    expect(assertTakes(house, 'hrw')).toBe('hrw');
    expect(() => assertTakes(house, 'sorghum')).toThrow(/does not take sorghum/);
  });

  it('summarises itself', () => {
    expect(houseSummary(house)).toEqual({
      name: 'Rush Creek Grain',
      commodities: 'corn, soybeans, hrw',
      bins: 2,
      shrinkFactor: 1.4,
      hasDrying: true,
      hasDiscounts: true,
      hasStorage: true,
    });
  });
});
