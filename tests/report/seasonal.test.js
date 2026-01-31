import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { formatBushels } from '../../src/core/money.js';
import { loadHouse } from '../../src/config/house.js';
import { importSamples, importTickets } from '../../src/io/importers.js';
import { settleDay } from '../../src/settlement/day.js';
import { buildSeason, compareSeasons, marginOf, renderSeason } from '../../src/report/seasonal.js';

const read = (name) => readFileSync(new URL(`../../examples/${name}`, import.meta.url), 'utf8');
const house = loadHouse(JSON.parse(read('rush-creek.json')));
const tickets = importTickets(read('tickets-2025-10-09.csv')).records;
const samples = importSamples(read('samples-2025-10-09.csv')).records;
const settlements = settleDay({ house, tickets, samples, bidPoints: 42_750 });

const season = buildSeason({ settlements, commodity: 'corn' });

describe('building a season', () => {
  it('takes the crop year off the first settlement', () => {
    expect(season.cropYear).toBe('2025/26');
    expect(season.from).toBe('2025-09-01');
    expect(season.to).toBe('2026-08-31');
  });

  it('counts only the commodity asked for', () => {
    expect(season.loads).toBe(6);
    expect(buildSeason({ settlements, commodity: 'soybeans' }).loads).toBe(1);
  });

  it('adds the bushels both ways and the difference between them', () => {
    expect(season.netBushels).toBeLessThan(season.grossBushels);
    expect(season.keptBushels).toBe(season.grossBushels - season.netBushels);
    expect(season.keptPercent).toBeGreaterThan(0);
  });

  it('weights the average moisture by the bushels', () => {
    expect(season.averageMoisture).toBeGreaterThan(15);
    expect(season.averageMoisture).toBeLessThan(18);
  });

  it('works the average price out of what was actually paid', () => {
    expect(season.averagePricePoints).toBeLessThan(42_750);
    expect(season.averagePricePoints).toBeGreaterThan(38_000);
  });

  it('splits the season by month', () => {
    expect(season.months).toHaveLength(1);
    expect(season.months[0].month).toBe('2025-10');
    expect(season.months[0].loads).toBe(6);
  });

  it('splits the bushels by grade', () => {
    const shares = season.grades.reduce((sum, row) => sum + row.share, 0);
    expect(shares).toBeGreaterThan(99);
    expect(shares).toBeLessThan(101);
    expect(season.grades.map((row) => row.label)).toContain('US 1');
  });

  it('takes the crop year from a day it was given', () => {
    const wheat = buildSeason({ settlements, commodity: 'corn', asOf: '2025-08-31' });
    expect(wheat.cropYear).toBe('2024/25');
  });

  it('refuses an empty season', () => {
    expect(() => buildSeason({ settlements: [] })).toThrow(/at least 1/);
  });
});

describe('the margin', () => {
  it('separates what was kept from what was charged', () => {
    const margin = marginOf(season);
    expect(margin.shrinkBushels).toBe(season.keptBushels);
    expect(margin.chargedCents).toBe(margin.discountCents + margin.dryingCents);
    expect(margin.dryingCents).toBeGreaterThan(0);
  });
});

describe('comparing two seasons', () => {
  it('reports the movement in each measure', () => {
    const drier = buildSeason({
      settlements: settlements.filter((entry) => entry.ticket !== 'T-10446'),
      commodity: 'corn',
    });
    const change = compareSeasons(season, drier);
    expect(change.commodity).toBe('corn');
    expect(change.moistureChange).toBeLessThan(0);
    expect(change.bushelChange).toBeLessThan(0);
  });
});

describe('printing', () => {
  it('lays the season out', () => {
    const text = renderSeason(season);
    expect(text).toContain('corn 2025/26');
    expect(text).toContain('Kept as shrink and dockage');
    expect(text).toContain('2025-10');
    expect(text).toContain(formatBushels(season.netBushels));
  });
});
