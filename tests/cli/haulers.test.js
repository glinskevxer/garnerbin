import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runHaulers } from '../../src/cli/haulers.js';

const example = (name) => fileURLToPath(new URL(`../../examples/${name}`, import.meta.url));

const base = {
  house: example('rush-creek.json'),
  tickets: example('tickets-2025-10-09.csv'),
  samples: example('samples-2025-10-09.csv'),
  bid: '4.2750',
};

let directory;

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'garnerbin-haulers-'));
});

afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});

describe('the hauler summary', () => {
  const result = runHaulers(base);

  it('gives a row for every hauler', () => {
    expect(result.rows).toHaveLength(4);
    expect(result.text).toContain('Rush Creek Grain haulers');
  });

  it('names the ones running wet', () => {
    expect(result.wet.length).toBeGreaterThan(0);
    expect(result.text).toContain('Running wetter than the house:');
  });

  it('names the busiest three', () => {
    expect(result.text).toContain('Busiest:');
    expect(result.text).toContain('Halvorsen Farms');
  });

  it('works off the tickets alone with no bid', () => {
    const unsettled = runHaulers({ house: base.house, tickets: base.tickets });
    expect(unsettled.rows[0].averageMoisture).toBeNull();
    expect(unsettled.wet).toEqual([]);
  });

  it('takes every day when asked', () => {
    expect(runHaulers({ ...base, allDays: true }).rows).toHaveLength(4);
  });
});

describe('writing it out', () => {
  it('writes a csv with a row for each hauler', async () => {
    const out = join(directory, 'haulers.csv');
    runHaulers({ ...base, out });
    const csv = await readFile(out, 'utf8');
    expect(csv.split('\n')[0]).toBe(
      'hauler,loads,units,grossBushels,averageLoad,averageMoisture,shrinkPercent,paid'
    );
    expect(csv.trim().split('\n')).toHaveLength(5);
  });
});
