import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { formatBushels } from '../src/core/money.js';
import { loadHouse } from '../src/config/house.js';
import { importSamples, importTickets } from '../src/io/importers.js';
import { settleDay } from '../src/settlement/day.js';
import { buildRegister } from '../src/report/register.js';
import { closeDay } from '../src/report/dailyclose.js';
import { buildSeason } from '../src/report/seasonal.js';
import { haulerSummary } from '../src/report/hauler.js';
import { reconcileSeries } from '../src/weights/reconcile.js';

const read = (name) => readFileSync(new URL(`../examples/${name}`, import.meta.url), 'utf8');
const house = loadHouse(JSON.parse(read('rush-creek.json')));

const tickets = [
  ...importTickets(read('tickets-2025-10-09.csv')).records,
  ...importTickets(read('tickets-2025-10-10.csv')).records,
];
const samples = [
  ...importSamples(read('samples-2025-10-09.csv')).records,
  ...importSamples(read('samples-2025-10-10.csv')).records,
];

const days = ['2025-10-09', '2025-10-10'];

/**
 * Everything else in the suite works on one day. This runs two, because the
 * bugs that only show up on the second day are the ones about carrying a
 * balance forward and about filtering by day at all.
 */

describe('two days of tickets', () => {
  it('reads both days with no problems', () => {
    expect(tickets).toHaveLength(15);
    expect(samples).toHaveLength(12);
    expect(new Set(tickets.map((ticket) => ticket.day))).toEqual(new Set(days));
  });

  it('has a sample for every inbound ticket on both days', () => {
    const ids = new Set(samples.map((sample) => sample.id));
    for (const ticket of tickets.filter((entry) => entry.direction === 'in')) {
      expect(ids.has(ticket.sampleId), ticket.number).toBe(true);
    }
  });

  it('settles each day on its own', () => {
    for (const day of days) {
      const settlements = settleDay({ house, tickets, samples, day, bidPoints: 42_750 });
      expect(settlements.every((entry) => entry.day === day)).toBe(true);
      expect(settlements.length).toBeGreaterThan(0);
    }
  });

  it('keeps the registers separate', () => {
    const first = buildRegister({
      day: days[0],
      tickets: tickets.filter((ticket) => ticket.day === days[0]),
      settlements: [],
    });
    const second = buildRegister({
      day: days[1],
      tickets: tickets.filter((ticket) => ticket.day === days[1]),
      settlements: [],
    });
    expect(first.totals.tickets).toBe(8);
    expect(second.totals.tickets).toBe(7);
    expect(second.totals.outbound).toBe(2);
  });
});

describe('closing two days in a row', () => {
  it('carries the measured figure from one close into the next opening', () => {
    const firstSettlements = settleDay({
      house,
      tickets,
      samples,
      day: days[0],
      bidPoints: 42_750,
    });
    const first = closeDay({
      day: days[0],
      house: house.name,
      tickets,
      settlements: firstSettlements,
      opening: 800_000,
      measured: 994_856,
    });
    expect(first.reconciliation.direction).toBe('flat');

    const secondSettlements = settleDay({
      house,
      tickets,
      samples,
      day: days[1],
      bidPoints: 42_750,
    });
    const second = closeDay({
      day: days[1],
      house: house.name,
      tickets,
      settlements: secondSettlements,
      opening: first.reconciliation.measured,
      measured: 609_052,
    });
    expect(second.reconciliation.opening).toBe(994_856);
    expect(second.reconciliation.book).toBe(614_052);
    expect(second.reconciliation.variance).toBe(-5000);
    expect(second.reconciliation.direction).toBe('short');
  });

  it('seals the two days differently', () => {
    const first = closeDay({ day: days[0], tickets, settlements: [] });
    const second = closeDay({ day: days[1], tickets, settlements: [] });
    expect(first.seal).not.toBe(second.seal);
  });

  it('runs the reconciliation forward across both days', () => {
    const rows = reconcileSeries([
      { day: days[0], receipts: 589_498, shipments: 394_642, measured: 194_856 },
      { day: days[1], receipts: 400_000, shipments: 380_000, measured: 214_000 },
    ]);
    expect(rows[1].opening).toBe(194_856);
    expect(rows[1].direction).toBe('short');
  });
});

describe('across both days', () => {
  const settlements = [
    ...settleDay({ house, tickets, samples, day: days[0], bidPoints: 42_750 }),
    ...settleDay({ house, tickets, samples, day: days[1], bidPoints: 42_750 }),
  ];

  it('adds a season out of both days', () => {
    const season = buildSeason({ settlements, commodity: 'corn' });
    expect(season.loads).toBe(10);
    expect(season.months).toHaveLength(1);
    expect(formatBushels(season.grossBushels)).toMatch(/^\d/);
  });

  it('adds a haulers summary out of both days', () => {
    const rows = haulerSummary(tickets, settlements);
    const kessel = rows.find((row) => row.hauler === 'Kessel Brothers');
    expect(kessel.loads).toBe(3);
    expect(rows.every((row) => row.hauler !== 'BNSF 476212')).toBe(true);
  });

  it('does not double count a day when both are given', () => {
    const oneDay = settleDay({ house, tickets, samples, day: days[0], bidPoints: 42_750 });
    expect(settlements.length).toBeGreaterThan(oneDay.length);
  });
});
