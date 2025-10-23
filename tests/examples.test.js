import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { loadHouse, takes } from '../src/config/house.js';
import { importSamples, importTickets } from '../src/io/importers.js';
import { importBasisBook, importQuoteBoard } from '../src/io/importers.js';
import { settleLoad } from '../src/settlement/settle.js';
import { bidFrom } from '../src/pricing/basis.js';
import { settleOf } from '../src/pricing/quotes.js';
import { formatMoney } from '../src/core/money.js';

const read = (name) => readFileSync(new URL(`../examples/${name}`, import.meta.url), 'utf8');

const house = loadHouse(JSON.parse(read('rush-creek.json')));
const tickets = importTickets(read('tickets-2025-10-09.csv'));
const samples = importSamples(read('samples-2025-10-09.csv'));
const board = importQuoteBoard(read('board-2025-10-09.csv'), '2025-10-09');
const basisBook = importBasisBook(read('basis-2025-10-09.csv'), {
  house: 'Rush Creek Grain',
  day: '2025-10-09',
});
const basis = basisBook.boards.corn;

describe('the worked day loads', () => {
  it('reads the house file with no problems', () => {
    expect(house.name).toBe('Rush Creek Grain');
    expect(house.bins).toHaveLength(5);
  });

  it('reads every ticket and every sample', () => {
    expect(tickets.problems).toEqual([]);
    expect(samples.problems).toEqual([]);
    expect(tickets.records).toHaveLength(8);
    expect(samples.records).toHaveLength(7);
  });

  it('has a sample for every inbound ticket', () => {
    const ids = new Set(samples.records.map((sample) => sample.id));
    for (const ticket of tickets.records.filter((entry) => entry.direction === 'in')) {
      expect(ids.has(ticket.sampleId)).toBe(true);
    }
  });

  it('only takes grain the house takes', () => {
    for (const ticket of tickets.records) {
      expect(takes(house, ticket.commodity)).toBe(true);
    }
  });

  it('puts every ticket in a bin the house has', () => {
    const bins = new Set(house.bins.map((bin) => bin.id));
    for (const ticket of tickets.records) {
      if (ticket.bin) expect(bins.has(ticket.bin)).toBe(true);
    }
  });
});

describe('the worked day settles', () => {
  const bid = bidFrom(basis, '2025-10', settleOf(board, 'ZCZ25'));

  it('quotes a cash corn bid off the board and the basis', () => {
    expect(bid).toBe(39_000);
  });

  it('settles every corn load without throwing', () => {
    const settlements = tickets.records
      .filter((ticket) => ticket.direction === 'in' && ticket.commodity === 'corn')
      .map((ticket) =>
        settleLoad({
          ticket,
          sample: samples.records.find((sample) => sample.id === ticket.sampleId),
          bidPoints: bid,
          discountSchedule: house.discounts.corn,
          dryingSchedule: house.drying.corn,
          assessments: house.assessments.slice(0, 1),
          shrinkFactor: house.shrinkFactor,
        })
      );
    expect(settlements).toHaveLength(6);
    for (const settlement of settlements) {
      expect(settlement.netCents).toBeGreaterThan(0);
      expect(settlement.weights.netBushels).toBeGreaterThan(0);
    }
  });

  it('pays the wet damaged load less a bushel than the clean one', () => {
    const settleFor = (ticketNumber) => {
      const ticket = tickets.records.find((entry) => entry.number === ticketNumber);
      return settleLoad({
        ticket,
        sample: samples.records.find((sample) => sample.id === ticket.sampleId),
        bidPoints: bid,
        discountSchedule: house.discounts.corn,
        dryingSchedule: house.drying.corn,
        shrinkFactor: house.shrinkFactor,
      });
    };
    const clean = settleFor('T-10444');
    const rough = settleFor('T-10446');
    expect(rough.netCents / rough.weights.netBushels).toBeLessThan(
      clean.netCents / clean.weights.netBushels
    );
    expect(formatMoney(clean.netCents)).toMatch(/^\d/);
  });
});
