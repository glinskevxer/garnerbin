import { describe, expect, it } from 'vitest';
import { formatBushels } from '../../src/core/money.js';
import {
  applyShrink,
  DEFAULT_SHRINK_FACTOR,
  dryWeight,
  impliedWaterFactor,
  pointsRemoved,
  shrinkPercent,
  shrinkPercentFor,
  shrinkPounds,
  totalShrink,
  waterShrinkPercent,
} from '../../src/weights/shrink.js';

describe('water shrink', () => {
  it('is the water that leaves over what is left', () => {
    expect(waterShrinkPercent(20, 15)).toBe(5.8824);
    expect(waterShrinkPercent(15.5, 15)).toBe(0.5882);
  });

  it('is nothing when the grain is already dry enough', () => {
    expect(waterShrinkPercent(14, 15)).toBe(0);
    expect(waterShrinkPercent(15, 15)).toBe(0);
  });

  it('implies about 1.18 per point at fifteen percent', () => {
    expect(impliedWaterFactor(20, 15)).toBeCloseTo(1.1765, 3);
    expect(impliedWaterFactor(14, 15)).toBe(0);
  });

  it('counts the points removed to the tenth', () => {
    expect(pointsRemoved(18.4, 15)).toBe(3.4);
    expect(pointsRemoved(14.2, 15)).toBe(0);
  });
});

describe('commercial shrink', () => {
  it('multiplies the points by the house factor', () => {
    expect(DEFAULT_SHRINK_FACTOR).toBe(1.4);
    expect(shrinkPercent({ from: 20, to: 15 })).toBe(7);
    expect(shrinkPercent({ from: 20, to: 15, factor: 1.18 })).toBe(5.9);
  });

  it('takes nothing off a dry load', () => {
    expect(shrinkPercent({ from: 13.5, to: 15 })).toBe(0);
  });

  it('starts from the market moisture for the commodity', () => {
    expect(shrinkPercentFor('corn', 18)).toBe(4.2);
    expect(shrinkPercentFor('soybeans', 15)).toBe(2.8);
    expect(shrinkPercentFor('hrw', 13.5)).toBe(0);
  });

  it('refuses a factor of zero', () => {
    expect(() => shrinkPercent({ from: 20, to: 15, factor: 0 })).toThrow(/greater than zero/);
  });
});

describe('applying shrink to a load', () => {
  it('splits the bushels and keeps the two halves adding up', () => {
    const split = applyShrink(100_000, 7);
    expect(formatBushels(split.shrinkBushels)).toBe('70.00');
    expect(formatBushels(split.netBushels)).toBe('930.00');
    expect(split.netBushels + split.shrinkBushels).toBe(100_000);
  });

  it('truncates the shrink rather than rounding it up', () => {
    const split = applyShrink(123_456, 4.2);
    expect(formatBushels(split.shrinkBushels)).toBe('51.85');
  });

  it('leaves a dry load whole', () => {
    expect(applyShrink(100_000, 0).netBushels).toBe(100_000);
  });

  it('cuts the pounds the same way', () => {
    expect(shrinkPounds(50_000, 7)).toBe(3500);
  });
});

describe('dry weight', () => {
  it('is the weight once the water is gone', () => {
    expect(dryWeight(50_000, 20, 15)).toBe(47_059);
    expect(dryWeight(50_000, 15, 15)).toBe(50_000);
    expect(dryWeight(50_000, 14, 15)).toBe(50_000);
  });

  it('loses more weight than the water shrink at a 1.4 factor', () => {
    const water = 50_000 - dryWeight(50_000, 20, 15);
    const commercial = shrinkPounds(50_000, shrinkPercent({ from: 20, to: 15 }));
    expect(commercial).toBeGreaterThan(water);
  });
});

describe('the whole deduction', () => {
  it('reports the moisture and the handling parts separately', () => {
    const shrink = totalShrink({ from: 19, to: 15, handlingPercent: 0.5 });
    expect(shrink.points).toBe(4);
    expect(shrink.moisturePercent).toBe(5.6);
    expect(shrink.handlingPercent).toBe(0.5);
    expect(shrink.totalPercent).toBe(6.1);
  });

  it('reports only handling on a dry load', () => {
    const shrink = totalShrink({ from: 14, to: 15, handlingPercent: 0.5 });
    expect(shrink.moisturePercent).toBe(0);
    expect(shrink.totalPercent).toBe(0.5);
  });

  it('refuses a negative handling percent', () => {
    expect(() => totalShrink({ from: 19, to: 15, handlingPercent: -1 })).toThrow(/not be negative/);
  });
});
