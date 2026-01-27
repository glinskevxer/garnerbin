import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runBids } from '../../src/cli/bids.js';

const example = (name) => fileURLToPath(new URL(`../../examples/${name}`, import.meta.url));

const base = {
  board: example('board-2025-10-09.csv'),
  basis: example('basis-2025-10-09.csv'),
  day: '2025-10-09',
};

let directory;

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'garnerbin-bids-'));
});

afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});

describe('the bid sheet', () => {
  it('quotes every grain on the basis file', () => {
    const result = runBids(base);
    expect(new Set(result.sheet.rows.map((row) => row.commodity))).toEqual(
      new Set(['corn', 'soybeans', 'hrw'])
    );
    expect(result.text).toContain('The house bids for 2025-10-09');
  });

  it('names the house when it is given one', () => {
    const result = runBids({ ...base, house: example('rush-creek.json') });
    expect(result.text).toContain('Rush Creek Grain bids for 2025-10-09');
  });

  it('narrows to one commodity', () => {
    const result = runBids({ ...base, commodity: 'corn' });
    expect(new Set(result.sheet.rows.map((row) => row.commodity))).toEqual(new Set(['corn']));
  });

  it('prices the october corn bid off the board and the basis', () => {
    const october = runBids(base).sheet.rows.find(
      (row) => row.commodity === 'corn' && row.period === '2025-10'
    );
    expect(october.bidPoints).toBe(39_000);
  });

  it('finds nothing to complain about on the worked day', () => {
    expect(runBids({ ...base, house: example('rush-creek.json') }).sheet.problems).toEqual([]);
  });

  it('says which file is missing', () => {
    expect(() => runBids({ ...base, board: example('nowhere.csv') })).toThrow(/no board file at/);
  });
});

describe('writing it out', () => {
  it('writes a csv with a row for each quote', async () => {
    const out = join(directory, 'bids.csv');
    const result = runBids({ ...base, out });
    const csv = await readFile(out, 'utf8');
    expect(csv.split('\n')[0]).toBe('day,commodity,period,month,board,basis,bid');
    expect(csv.trim().split('\n')).toHaveLength(result.sheet.rows.length + 1);
  });
});
