import { describe, expect, it } from 'vitest';
import { createSample } from '../../src/grading/sample.js';
import {
  factorTable,
  gradeDistribution,
  renderGradeReport,
  summariseFactor,
  worstFactor,
} from '../../src/report/grades.js';

function load(overrides, bushels = 100_000) {
  return {
    bushels,
    sample: createSample({
      id: 'S',
      commodity: 'corn',
      day: '2025-10-09',
      testWeight: 56,
      damagedTotal: 2,
      heatDamaged: 0,
      bcfm: 1,
      moisture: 15,
      ...overrides,
    }),
  };
}

const loads = [
  load({}),
  load({ damagedTotal: 4 }),
  load({ damagedTotal: 6.5 }, 200_000),
  load({ testWeight: 51 }),
  load({ musty: true }),
];

describe('summariseFactor', () => {
  it('gives the shape of a column of readings', () => {
    const summary = summariseFactor([1, 2, 3, 4, 5]);
    expect(summary.count).toBe(5);
    expect(summary.min).toBe(1);
    expect(summary.max).toBe(5);
    expect(summary.mean).toBe(3);
    expect(summary.median).toBe(3);
    expect(summary.spread).toBeCloseTo(1.414, 3);
  });

  it('interpolates a quantile between two readings', () => {
    expect(summariseFactor([1, 2, 3, 4]).median).toBe(2.5);
    expect(summariseFactor([1, 2, 3, 4]).p90).toBe(3.7);
  });

  it('ignores the readings nobody took', () => {
    expect(summariseFactor([1, undefined, 3]).count).toBe(2);
  });

  it('answers nulls on an empty column', () => {
    expect(summariseFactor([]).mean).toBeNull();
  });
});

describe('gradeDistribution', () => {
  const rows = gradeDistribution(loads, 'corn');

  it('gives a row for every grade including sample', () => {
    expect(rows.map((row) => row.label)).toEqual([
      'US 1',
      'US 2',
      'US 3',
      'US 4',
      'US 5',
      'Sample',
    ]);
  });

  it('counts loads and bushels separately', () => {
    const three = rows.find((row) => row.label === 'US 3');
    expect(three.loads).toBe(1);
    expect(three.bushels).toBe(200_000);
  });

  it('shares out by loads and by bushels', () => {
    const one = rows.find((row) => row.label === 'US 1');
    expect(one.loads).toBe(1);
    expect(one.loadPercent).toBe(20);
    expect(one.bushelPercent).toBeLessThan(one.loadPercent);
  });

  it('puts the musty load in sample grade', () => {
    expect(rows.find((row) => row.label === 'Sample').loads).toBe(1);
  });

  it('leaves the empty grades at zero', () => {
    expect(rows.find((row) => row.label === 'US 5').loads).toBe(0);
  });
});

describe('factorTable', () => {
  it('summarises every factor in the table', () => {
    const table = factorTable(loads, 'corn');
    expect(table).toHaveLength(4);
    const testWeight = table.find((row) => row.factor === 'Test weight');
    expect(testWeight.min).toBe(51);
    expect(testWeight.max).toBe(56);
  });
});

describe('worstFactor', () => {
  it('names what held the most loads back', () => {
    expect(worstFactor(loads, 'corn').factor).toBe('damagedTotal');
  });

  it('answers nothing when everything made number one', () => {
    expect(worstFactor([load({}), load({})], 'corn')).toBeNull();
  });
});

describe('rendering', () => {
  it('prints both tables under a heading', () => {
    const text = renderGradeReport(loads, 'corn', { house: 'Rush Creek', season: '2025/26' });
    expect(text).toContain('Rush Creek corn grades 2025/26');
    expect(text).toContain('US 1');
    expect(text).toContain('Test weight');
  });

  it('drops the season when there is not one', () => {
    expect(renderGradeReport(loads, 'corn')).toContain('unnamed house corn grades');
  });
});
