import { describe, expect, it } from 'vitest';
import {
  bandContaining,
  bandTable,
  normaliseBands,
  rateFor,
  rateIn,
} from '../../src/pricing/bands.js';

const bands = normaliseBands([
  { from: 0, to: 5, points: 0 },
  { from: 5, to: 8, pointsPerUnit: 100, step: 1 },
  { from: 8, to: null, points: 500 },
]);

describe('checking a set of bands', () => {
  it('freezes what it built', () => {
    expect(Object.isFrozen(bands)).toBe(true);
    expect(Object.isFrozen(bands[0])).toBe(true);
  });

  it('refuses a hole', () => {
    expect(() =>
      normaliseBands(
        [
          { from: 0, to: 5, points: 0 },
          { from: 6, to: null, points: 100 },
        ],
        'damage'
      )
    ).toThrow(/damage has a hole before band 1/);
  });

  it('refuses a set that does not run open ended', () => {
    expect(() => normaliseBands([{ from: 0, to: 5, points: 0 }], 'damage')).toThrow(
      /damage does not cover its worst readings/
    );
  });

  it('refuses an inverted band and a step of nothing', () => {
    expect(() => normaliseBands([{ from: 5, to: 2 }], 'damage')).toThrow(/ends at or before/);
    expect(() =>
      normaliseBands([{ from: 0, to: null, pointsPerUnit: 10, step: 0 }], 'damage')
    ).toThrow(/has a step of 0/);
  });

  it('refuses an empty set', () => {
    expect(() => normaliseBands([])).toThrow(/at least 1/);
  });
});

describe('finding the band', () => {
  it('takes the band that contains the reading', () => {
    expect(bandContaining(bands, 0).points).toBe(0);
    expect(bandContaining(bands, 4.99).points).toBe(0);
    expect(bandContaining(bands, 5).pointsPerUnit).toBe(100);
    expect(bandContaining(bands, 100).points).toBe(500);
  });

  it('answers nothing below the first band', () => {
    expect(bandContaining(bands, -1)).toBeNull();
  });
});

describe('the rate', () => {
  it('is flat inside a flat band', () => {
    expect(rateFor(bands, 3)).toBe(0);
    expect(rateFor(bands, 12)).toBe(500);
  });

  it('steps up from the band floor', () => {
    expect(rateFor(bands, 5)).toBe(0);
    expect(rateFor(bands, 5.1)).toBe(100);
    expect(rateFor(bands, 6)).toBe(100);
    expect(rateFor(bands, 6.1)).toBe(200);
  });

  it('is nothing for a reading in no band at all', () => {
    expect(rateFor(bands, -1)).toBe(0);
    expect(rateIn(null, 5)).toBe(0);
  });
});

describe('the table for the wall', () => {
  it('lays every band out', () => {
    const rows = bandTable(bands);
    expect(rows).toHaveLength(3);
    expect(rows[1]).toEqual({ from: 5, to: 8, rate: null, perUnit: 100, step: 1 });
    expect(rows[2].to).toBeNull();
  });
});
