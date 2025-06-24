import { describe, expect, it } from 'vitest';
import { formatMoney } from '../../src/core/money.js';
import { createQuoteBoard } from '../../src/pricing/quotes.js';
import { closeLot, openLot } from '../../src/hedging/hedge.js';
import {
  accountEquity,
  bookStatus,
  MARGIN_PER_CONTRACT,
  marginCall,
  marginFor,
  marginRequirement,
  markBook,
  markLot,
} from '../../src/hedging/marktomarket.js';

function lot(overrides = {}) {
  return openLot({
    id: 'H-1',
    commodity: 'corn',
    contract: 'ZCZ25',
    side: 'short',
    contracts: 10,
    pricePoints: 46_250,
    openedOn: '2025-09-15',
    ...overrides,
  });
}

const board = createQuoteBoard({
  day: '2025-11-14',
  quotes: [
    { contract: 'ZCZ25', settle: 48_000 },
    { contract: 'ZSX25', settle: 105_000 },
  ],
});

describe('marking one lot', () => {
  it('costs a short when the board rises', () => {
    const mark = markLot(lot(), 48_000);
    expect(mark.points).toBe(-1750);
    expect(formatMoney(mark.cents)).toBe('-8,750.00');
  });

  it('pays a short when the board falls', () => {
    expect(markLot(lot(), 44_000).points).toBe(2250);
  });

  it('runs a long the other way', () => {
    expect(markLot(lot({ side: 'long' }), 48_000).points).toBe(1750);
  });

  it('refuses to mark a closed lot', () => {
    const closed = closeLot(lot(), { pricePoints: 44_000, day: '2025-11-01' });
    expect(() => markLot(closed, 48_000)).toThrow(/does not mark/);
  });
});

describe('marking the book', () => {
  it('prices every open lot off the board', () => {
    const marked = markBook(
      [
        lot(),
        lot({
          id: 'H-2',
          commodity: 'soybeans',
          contract: 'ZSX25',
          contracts: 4,
          pricePoints: 108_000,
        }),
      ],
      board
    );
    expect(marked.marks).toHaveLength(2);
    expect(formatMoney(marked.unrealisedCents)).toBe('-2,750.00');
  });

  it('leaves closed lots out of the mark', () => {
    const closed = closeLot(lot({ id: 'H-9' }), { pricePoints: 44_000, day: '2025-11-01' });
    expect(markBook([lot(), closed], board).marks).toHaveLength(1);
  });

  it('says so when the board is missing a month', () => {
    expect(() => markBook([lot({ contract: 'ZCH26' })], board)).toThrow(/did not settle/);
  });
});

describe('margin', () => {
  it('posts a rate for every commodity the house hedges', () => {
    expect(Object.keys(MARGIN_PER_CONTRACT)).toContain('corn');
    expect(marginFor('corn').initial).toBe(120_000);
    expect(() => marginFor('oats')).toThrow(/no margin posted/);
  });

  it('adds the requirement across the open book', () => {
    const requirement = marginRequirement([lot(), lot({ id: 'H-2', contracts: 5 })]);
    expect(formatMoney(requirement.initialCents)).toBe('18,000.00');
    expect(formatMoney(requirement.maintenanceCents)).toBe('15,000.00');
  });

  it('counts nothing for a closed lot', () => {
    const closed = closeLot(lot(), { pricePoints: 44_000, day: '2025-11-01' });
    expect(marginRequirement([closed]).initialCents).toBe(0);
  });
});

describe('the call', () => {
  it('leaves an account above maintenance alone', () => {
    const call = marginCall({
      equityCents: 1_200_000,
      initialCents: 1_200_000,
      maintenanceCents: 1_000_000,
    });
    expect(call.called).toBe(false);
    expect(formatMoney(call.cushionCents)).toBe('2,000.00');
  });

  it('calls back to initial and not to maintenance', () => {
    const call = marginCall({
      equityCents: 900_000,
      initialCents: 1_200_000,
      maintenanceCents: 1_000_000,
    });
    expect(call.called).toBe(true);
    expect(formatMoney(call.cents)).toBe('3,000.00');
  });

  it('adds up equity from cash and the mark', () => {
    expect(accountEquity({ cashCents: 1_500_000, unrealisedCents: -875_000 })).toBe(625_000);
  });
});

describe('the whole book', () => {
  it('reports a cushion when the account is fat', () => {
    const status = bookStatus([lot()], board, 2_000_000);
    expect(status.call.called).toBe(false);
    expect(status.line).toContain('cushion of');
  });

  it('reports a call when the board has run away', () => {
    const status = bookStatus([lot()], board, 1_000_000);
    expect(status.call.called).toBe(true);
    expect(status.line).toContain('call for');
    expect(status.equityCents).toBe(1_000_000 - 875_000);
  });
});
