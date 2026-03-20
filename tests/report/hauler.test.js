import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { formatBushels } from '../../src/core/money.js';
import { loadHouse } from '../../src/config/house.js';
import { importSamples, importTickets } from '../../src/io/importers.js';
import { settleDay } from '../../src/settlement/day.js';
import {
  busiest,
  haulerSummary,
  renderHaulers,
  wetterThanAverage,
} from '../../src/report/hauler.js';

const read = (name) => readFileSync(new URL(`../../examples/${name}`, import.meta.url), 'utf8');
const house = loadHouse(JSON.parse(read('rush-creek.json')));
const tickets = importTickets(read('tickets-2025-10-09.csv')).records;
const samples = importSamples(read('samples-2025-10-09.csv')).records;
const settlements = settleDay({ house, tickets, samples, bidPoints: 42_750 });

describe('the hauler summary', () => {
  const rows = haulerSummary(tickets, settlements);

  it('gives a row for each hauler that brought something in', () => {
    expect(rows.map((row) => row.hauler)).toEqual([
      'Halvorsen Farms',
      'Kessel Brothers',
      'Voss Land Co',
      'Ivo Drake',
    ]);
  });

  it('leaves the outbound car out', () => {
    expect(rows.some((row) => row.hauler === 'BNSF 476211')).toBe(false);
  });

  it('sorts the biggest hauler first', () => {
    expect(rows[0].grossBushels).toBeGreaterThanOrEqual(rows[1].grossBushels);
  });

  it('lists the units each one ran', () => {
    const halvorsen = rows.find((row) => row.hauler === 'Halvorsen Farms');
    expect(halvorsen.units).toEqual(['blue peterbilt']);
    expect(halvorsen.loads).toBe(3);
  });

  it('works the average load out', () => {
    const drake = rows.find((row) => row.hauler === 'Ivo Drake');
    expect(formatBushels(drake.averageLoad)).toBe(formatBushels(drake.grossBushels));
  });

  it('weights the average moisture by bushels', () => {
    const voss = rows.find((row) => row.hauler === 'Voss Land Co');
    expect(voss.averageMoisture).toBe(21.2);
  });

  it('works the shrink percent out of what was settled', () => {
    const voss = rows.find((row) => row.hauler === 'Voss Land Co');
    expect(voss.shrinkPercent).toBeGreaterThan(5);
    const kessel = rows.find((row) => row.hauler === 'Kessel Brothers');
    expect(kessel.shrinkPercent).toBeLessThan(voss.shrinkPercent);
  });

  it('leaves the settled columns empty when nothing was settled', () => {
    const unsettled = haulerSummary(tickets);
    expect(unsettled[0].averageMoisture).toBeNull();
    expect(unsettled[0].shrinkPercent).toBeNull();
    expect(unsettled[0].netCents).toBe(0);
  });

  it('falls back to the account when nobody named a hauler', () => {
    const anonymous = tickets.map((ticket) => ({ ...ticket, hauler: null }));
    expect(haulerSummary(anonymous).map((row) => row.hauler)).toContain('HALVORSEN');
  });
});

describe('who is running wet', () => {
  const rows = haulerSummary(tickets, settlements);

  it('names the haulers over the house average', () => {
    const wet = wetterThanAverage(rows);
    expect(wet[0].hauler).toBe('Voss Land Co');
    expect(wet[0].overHouse).toBeGreaterThan(0);
  });

  it('says nothing when nothing was settled', () => {
    expect(wetterThanAverage(haulerSummary(tickets))).toEqual([]);
  });

  it('picks the busiest few', () => {
    expect(busiest(rows, 2)).toHaveLength(2);
    expect(busiest(rows)).toHaveLength(3);
  });
});

describe('printing', () => {
  it('lays the haulers out with the moisture column', () => {
    const text = renderHaulers(haulerSummary(tickets, settlements), { house: 'Rush Creek Grain' });
    expect(text).toContain('Rush Creek Grain haulers');
    expect(text).toContain('Halvorsen Farms');
    expect(text).toContain('shrink pct');
  });

  it('leaves the settled columns blank on an unsettled day', () => {
    const text = renderHaulers(haulerSummary(tickets));
    expect(text).toContain('unnamed house haulers');
  });
});
