import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { formatBushels, formatMoney } from '../../src/core/money.js';
import { loadHouse } from '../../src/config/house.js';
import { importSamples, importTickets } from '../../src/io/importers.js';
import { scheduleFor, settleAgainstHouse, settleDay, totalsOf } from '../../src/settlement/day.js';

const read = (name) => readFileSync(new URL(`../../examples/${name}`, import.meta.url), 'utf8');
const house = loadHouse(JSON.parse(read('rush-creek.json')));
const tickets = importTickets(read('tickets-2025-10-09.csv')).records;
const samples = importSamples(read('samples-2025-10-09.csv')).records;

describe('the schedules a house applies', () => {
  it('picks the schedules for the commodity', () => {
    const corn = scheduleFor(house, 'corn');
    expect(corn.discountSchedule.commodity).toBe('corn');
    expect(corn.dryingSchedule).not.toBeNull();
    expect(corn.shrinkFactor).toBe(1.4);
  });

  it('gives nothing for a commodity the house posts nothing for', () => {
    const wheat = scheduleFor(house, 'hrw');
    expect(wheat.discountSchedule).toBeNull();
    expect(wheat.dryingSchedule).toBeNull();
  });

  it('takes only the assessments for that commodity', () => {
    expect(scheduleFor(house, 'corn').assessments.map((entry) => entry.id)).toEqual([
      'corn-checkoff',
    ]);
    expect(scheduleFor(house, 'soybeans').assessments.map((entry) => entry.id)).toEqual([
      'soybeans-checkoff',
    ]);
    expect(scheduleFor(house, 'hrw').assessments).toEqual([]);
  });

  it('does not let one commodity pick up another ones charges', () => {
    const corn = scheduleFor(house, 'corn').assessments;
    expect(corn.every((entry) => entry.id.startsWith('corn-'))).toBe(true);
  });
});

describe('settling one load against the house', () => {
  it('uses the house schedules without being told them', () => {
    const ticket = tickets.find((entry) => entry.number === 'T-10446');
    const sample = samples.find((entry) => entry.id === ticket.sampleId);
    const settlement = settleAgainstHouse(house, { ticket, sample, bidPoints: 42_750 });
    expect(settlement.drying.cents).toBeGreaterThan(0);
    expect(settlement.discountPoints).toBeGreaterThan(0);
    expect(settlement.assessments.lines).toHaveLength(1);
  });
});

describe('settling a day', () => {
  it('settles every inbound ticket', () => {
    const settlements = settleDay({ house, tickets, samples, bidPoints: 42_750 });
    expect(settlements).toHaveLength(7);
    expect(settlements.every((entry) => entry.netCents > 0)).toBe(true);
  });

  it('leaves the outbound ticket out', () => {
    const settlements = settleDay({ house, tickets, samples, bidPoints: 42_750 });
    expect(settlements.map((entry) => entry.ticket)).not.toContain('T-10448');
  });

  it('narrows by day, commodity and ticket', () => {
    expect(settleDay({ house, tickets, samples, bidPoints: 1, day: '2025-10-10' })).toHaveLength(0);
    expect(
      settleDay({ house, tickets, samples, bidPoints: 1, commodity: 'soybeans' })
    ).toHaveLength(1);
    expect(settleDay({ house, tickets, samples, bidPoints: 1, ticket: 'T-10441' })).toHaveLength(1);
  });

  it('prices each commodity through the bid function', () => {
    const settlements = settleDay({
      house,
      tickets,
      samples,
      bidFor: (commodity) => (commodity === 'soybeans' ? 96_000 : 42_750),
    });
    const beans = settlements.find((entry) => entry.commodity === 'soybeans');
    expect(beans.bidPoints).toBe(96_000);
    expect(settlements.find((entry) => entry.commodity === 'corn').bidPoints).toBe(42_750);
  });

  it('says which ticket has no sample rather than settling it wrong', () => {
    const orphan = tickets.map((ticket) =>
      ticket.number === 'T-10441' ? { ...ticket, sampleId: 'S-9999' } : ticket
    );
    expect(() => settleDay({ house, tickets: orphan, samples, bidPoints: 42_750 })).toThrow(
      /names sample S-9999/
    );
  });

  it('refuses a house that is not an object', () => {
    expect(() => settleDay({ house: null, tickets, samples, bidPoints: 1 })).toThrow(
      /house is required/
    );
  });
});

describe('the totals', () => {
  const settlements = settleDay({ house, tickets, samples, bidPoints: 42_750 });

  it('adds the day up', () => {
    const totals = totalsOf(settlements);
    expect(totals.loads).toBe(7);
    expect(formatBushels(totals.grossBushels)).toBe('5,894.98');
    expect(totals.netBushels).toBeLessThan(totals.grossBushels);
    expect(formatMoney(totals.netCents)).toMatch(/^\d/);
  });

  it('totals nothing on an empty run', () => {
    expect(totalsOf([])).toEqual({
      loads: 0,
      grossBushels: 0,
      netBushels: 0,
      dryingCents: 0,
      discountCents: 0,
      netCents: 0,
    });
  });
});
