import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runSeason } from '../../src/cli/season.js';

const example = (name) => fileURLToPath(new URL(`../../examples/${name}`, import.meta.url));

const base = {
  house: example('rush-creek.json'),
  tickets: example('tickets-2025-10-09.csv'),
  samples: example('samples-2025-10-09.csv'),
  bid: '4.2750',
};

let directory;

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'garnerbin-season-'));
});

afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});

describe('adding a season up', () => {
  const result = runSeason(base);

  it('settles every inbound load in the files', () => {
    expect(result.settlements).toHaveLength(7);
  });

  it('gives a season for each grain that came in', () => {
    expect(result.seasons.map((season) => season.commodity)).toEqual(['corn', 'soybeans']);
  });

  it('puts the crop year on it', () => {
    expect(result.seasons[0].cropYear).toBe('2025/26');
    expect(result.text).toContain('Rush Creek Grain season');
  });

  it('shows the margin under each season', () => {
    expect(result.text).toContain('Kept as shrink');
    expect(result.text).toContain('Charged in discounts and drying');
  });

  it('narrows to one commodity', () => {
    expect(runSeason({ ...base, commodity: 'corn' }).seasons).toHaveLength(1);
  });

  it('refuses to add up files with nothing settleable in them', () => {
    expect(() => runSeason({ ...base, tickets: example('tickets-2025-10-10.csv') })).toThrow();
  });
});

describe('writing it out', () => {
  it('writes a csv with a row for each season', async () => {
    const out = join(directory, 'season.csv');
    runSeason({ ...base, out });
    const csv = await readFile(out, 'utf8');
    expect(csv.split('\n')[0]).toBe(
      'commodity,cropYear,loads,grossBushels,settlementBushels,keptPercent,averageMoisture,paid'
    );
    expect(csv.trim().split('\n')).toHaveLength(3);
  });
});
