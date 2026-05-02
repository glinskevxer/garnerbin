import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { runExceptions } from '../../src/cli/exceptions.js';

const example = (name) => fileURLToPath(new URL(`../../examples/${name}`, import.meta.url));

const base = {
  house: example('rush-creek.json'),
  asOf: '2025-10-09',
  tickets: example('tickets-2025-10-09.csv'),
  samples: example('samples-2025-10-09.csv'),
};

describe('the exception sheet', () => {
  it('says what it looked at', () => {
    const result = runExceptions(base);
    expect(result.looked).toEqual(['house', 'tickets', 'samples']);
    expect(result.text).toContain('Looked at  house, tickets, samples');
  });

  it('finds nothing wrong with the day it was taken', () => {
    const result = runExceptions(base);
    expect(result.counts.stop).toBe(0);
    expect(result.text).toContain('Rush Creek Grain exceptions at 2025-10-09');
  });

  it('warns once the tickets have sat unsettled', () => {
    const result = runExceptions({ ...base, asOf: '2025-10-20' });
    expect(result.counts.warn).toBe(7);
    expect(result.text).toContain('UNSETTLED');
  });

  it('takes a longer unsettled window', () => {
    const result = runExceptions({ ...base, asOf: '2025-10-20', unsettledDays: '30' });
    expect(result.counts.warn).toBe(0);
  });

  it('runs on the house file alone', () => {
    const result = runExceptions({ house: base.house, asOf: '2025-10-09' });
    expect(result.looked).toEqual(['house']);
    expect(result.text).toContain('Nothing to look at.');
  });
});

describe('with the rest of the desk', () => {
  it('checks the contracts when it is given them', () => {
    const result = runExceptions({
      ...base,
      contracts: example('contracts-2025.json'),
      asOf: '2026-03-01',
    });
    expect(result.looked).toContain('contracts');
    expect(result.exceptions.some((entry) => entry.code === 'CONTRACT_SHORT')).toBe(true);
  });

  it('checks the hedge against a covenant', () => {
    const result = runExceptions({
      ...base,
      position: example('position-2025-11-14.json'),
      unhedgedLimit: '1000',
      asOf: '2025-11-14',
    });
    expect(result.looked).toContain('position');
    expect(result.exceptions.some((entry) => entry.code === 'UNHEDGED')).toBe(true);
    expect(result.counts.stop).toBeGreaterThan(0);
  });

  it('says nothing about the hedge with no covenant given', () => {
    const result = runExceptions({
      ...base,
      position: example('position-2025-11-14.json'),
      asOf: '2025-11-14',
    });
    expect(result.exceptions.some((entry) => entry.code === 'UNHEDGED')).toBe(false);
  });
});

describe('the scale tests', () => {
  it('reads them when it is given them', () => {
    const result = runExceptions({ ...base, scaleTests: example('scale-tests-2025.json') });
    expect(result.looked).toContain('scale tests');
    expect(result.exceptions.some((entry) => entry.code === 'SCALE_OUT_OF_TOLERANCE')).toBe(false);
  });

  it('warns once the scales are overdue', () => {
    const result = runExceptions({
      ...base,
      asOf: '2026-06-01',
      scaleTests: example('scale-tests-2025.json'),
    });
    expect(result.exceptions.filter((entry) => entry.code === 'SCALE_TEST_OVERDUE')).toHaveLength(
      2
    );
  });
});

describe('what it refuses', () => {
  it('refuses a day it cannot read', () => {
    expect(() => runExceptions({ ...base, asOf: 'today' })).toThrow(/YYYY-MM-DD/);
  });
});
