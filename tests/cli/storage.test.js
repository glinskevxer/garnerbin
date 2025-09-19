import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { runStorage } from '../../src/cli/storage.js';

const example = (name) => fileURLToPath(new URL(`../../examples/${name}`, import.meta.url));

const base = {
  house: example('rush-creek.json'),
  file: example('lots-2026-03-01.json'),
};

describe('the storage report', () => {
  const result = runStorage(base);

  it('prints a row for every lot', () => {
    expect(result.rows).toHaveLength(6);
    expect(result.text).toContain('Rush Creek Grain open storage at 2026-03-01');
  });

  it('starts the clock at delivery on a lot that came in after the free date', () => {
    const fresh = result.rows.find((row) => row.lot === 'L-6');
    expect(fresh.days).toBe(18);
    expect(fresh.cents).toBeGreaterThan(0);
  });

  it('charges the same days on every harvest lot', () => {
    const october = result.rows.find((row) => row.lot === 'L-1');
    const november = result.rows.find((row) => row.lot === 'L-3');
    expect(october.days).toBe(november.days);
  });

  it('charges more on the bigger lot', () => {
    const small = result.rows.find((row) => row.lot === 'L-3');
    const large = result.rows.find((row) => row.lot === 'L-4');
    expect(large.cents).toBeGreaterThan(small.cents);
  });

  it('ages the lots into buckets', () => {
    expect(result.aging).toHaveLength(5);
    expect(result.aging.find((row) => row.bucket === 'over 180').bushels).toBeGreaterThan(0);
  });

  it('totals the charges', () => {
    expect(result.totalCents).toBe(result.rows.reduce((sum, row) => sum + row.cents, 0));
    expect(result.text).toContain('Charges accrued');
  });
});

describe('narrowing', () => {
  it('takes one account', () => {
    expect(runStorage({ ...base, account: 'KESSEL' }).rows).toHaveLength(2);
  });

  it('takes one commodity', () => {
    expect(runStorage({ ...base, commodity: 'hrw' }).rows).toHaveLength(1);
  });

  it('takes a day other than the one on the file', () => {
    const later = runStorage({ ...base, asOf: '2026-06-01' });
    expect(later.totalCents).toBeGreaterThan(runStorage(base).totalCents);
  });

  it('says so when nothing matches', () => {
    expect(() => runStorage({ ...base, account: 'NOBODY' })).toThrow(/nothing in that file/);
  });
});

describe('what it refuses', () => {
  it('refuses a file with no lots array', () => {
    expect(() => runStorage({ ...base, file: example('rush-creek.json') })).toThrow(
      /carries no lots/
    );
  });

  it('refuses a day it cannot read', () => {
    expect(() => runStorage({ ...base, asOf: 'march' })).toThrow(/YYYY-MM-DD/);
  });
});
