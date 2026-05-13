import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { runBins } from '../../src/cli/bins.js';

const example = (name) => fileURLToPath(new URL(`../../examples/${name}`, import.meta.url));

const base = {
  house: example('rush-creek.json'),
  file: example('holdings-2025-09-25.json'),
  cables: example('cables-2025-11-14.json'),
};

describe('the walk around sheet', () => {
  const result = runBins(base);

  it('gives a line for every bin in the holdings file', () => {
    expect(result.rows).toHaveLength(5);
    expect(result.text).toContain('Rush Creek Grain bins on 2025-11-14');
  });

  it('works out how full each one is', () => {
    const corn = result.rows.find((row) => row.bin === 'B-1');
    expect(corn.fill).toBeGreaterThan(0);
    expect(corn.fill).toBeLessThan(100);
  });

  it('reads the cables where there are any', () => {
    const cabled = result.rows.find((row) => row.bin === 'B-1');
    expect(cabled.condition).toBe('watch');
    expect(cabled.hotSpots).toBe(1);
  });

  it('leaves the cable columns blank on a bin with no cables', () => {
    expect(result.rows.find((row) => row.bin === 'B-2').condition).toBe('');
  });

  it('says which fans to run and why', () => {
    expect(result.running.length).toBeGreaterThan(0);
    expect(result.text).toContain('Run the fans on:');
    expect(result.running[0].why).toMatch(/cooling|drying/);
  });

  it('says how long the grain will keep', () => {
    const warm = result.rows.find((row) => row.bin === 'B-1');
    const cold = result.rows.find((row) => row.bin === 'B-3');
    expect(warm.keepsDays).toBeLessThan(cold.keepsDays);
  });

  it('names the bin to look at', () => {
    expect(result.watching.map((row) => row.bin)).toEqual(['B-1']);
    expect(result.text).toContain('Look at:');
  });
});

describe('without the cables', () => {
  it('still prints the fill', () => {
    const result = runBins({ house: base.house, file: base.file });
    expect(result.rows).toHaveLength(5);
    expect(result.rows.every((row) => row.condition === '')).toBe(true);
    expect(result.running).toEqual([]);
    expect(result.watching).toEqual([]);
  });
});

describe('what it refuses', () => {
  it('refuses a holdings file with no holdings array', () => {
    expect(() => runBins({ ...base, file: example('rush-creek.json') })).toThrow(
      /carries no holdings/
    );
  });

  it('refuses a bin the house does not have', () => {
    expect(() => runBins({ ...base, file: example('lots-2026-03-01.json') })).toThrow();
  });
});
