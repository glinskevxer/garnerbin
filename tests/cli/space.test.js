import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { runSpace } from '../../src/cli/space.js';

const example = (name) => fileURLToPath(new URL(`../../examples/${name}`, import.meta.url));

const base = {
  house: example('rush-creek.json'),
  file: example('holdings-2025-09-25.json'),
};

describe('the space sheet', () => {
  const result = runSpace(base);

  it('plans the grains the file expects', () => {
    expect(result.plans.map((plan) => plan.commodity)).toEqual(['corn', 'soybeans']);
  });

  it('counts only the bins the corn can go in', () => {
    const corn = result.plans.find((plan) => plan.commodity === 'corn');
    const beans = corn.rows.find((row) => row.bin === 'B-3');
    expect(beans.free).toBe(0);
    expect(beans.reason).toBe('holding soybeans');
  });

  it('says corn is short and beans are not', () => {
    const corn = result.plans.find((plan) => plan.commodity === 'corn');
    const beans = result.plans.find((plan) => plan.commodity === 'soybeans');
    expect(corn.enough).toBe(false);
    expect(beans.enough).toBe(true);
    expect(result.text).toContain('Short on');
  });

  it('sizes a pile for the corn that will not fit', () => {
    const corn = result.plans.find((plan) => plan.commodity === 'corn');
    expect(corn.pile).not.toBeNull();
    expect(result.text).toContain('feet across');
  });

  it('heads the sheet with the day off the file', () => {
    expect(result.text).toContain('Rush Creek Grain space at 2025-09-25');
  });

  it('narrows to one commodity', () => {
    expect(runSpace({ ...base, commodity: 'hrw' }).plans).toHaveLength(1);
  });

  it('takes an expected figure off the command line', () => {
    const plenty = runSpace({ ...base, commodity: 'corn', expected: '1000' });
    expect(plenty.plans[0].enough).toBe(true);
  });

  it('says how long the room lasts', () => {
    expect(runSpace({ ...base, daily: '45000' }).text).toContain('Days of room');
  });
});

describe('what it refuses', () => {
  it('refuses a holdings file with no holdings array', () => {
    expect(() => runSpace({ ...base, file: example('rush-creek.json') })).toThrow(
      /carries no holdings/
    );
  });

  it('refuses a bin the house does not have', () => {
    expect(() => runSpace({ ...base, file: example('lots-2026-03-01.json') })).toThrow();
  });
});
