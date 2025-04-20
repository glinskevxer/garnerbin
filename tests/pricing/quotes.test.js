import { describe, expect, it } from 'vitest';
import {
  carryCost,
  createQuoteBoard,
  monthsApart,
  percentOfFullCarry,
  renderBoard,
  settleOf,
  spread,
} from '../../src/pricing/quotes.js';

const board = createQuoteBoard({
  day: '2025-10-09',
  quotes: [
    { contract: 'ZCZ25', settle: 42_500, volume: 180_000 },
    { contract: 'ZCH26', settle: 44_000 },
    { contract: 'ZCK26', settle: 44_750 },
    { contract: 'ZCN26', settle: 45_250 },
  ],
});

describe('building a quote board', () => {
  it('keys every quote off the contract month', () => {
    expect(board.quotes.map((quote) => quote.key)).toEqual(['ZCZ25', 'ZCH26', 'ZCK26', 'ZCN26']);
    expect(board.quotes[0].volume).toBe(180_000);
    expect(board.quotes[1].volume).toBeNull();
  });

  it('refuses the same month twice', () => {
    expect(() =>
      createQuoteBoard({
        day: '2025-10-09',
        quotes: [
          { contract: 'ZCZ25', settle: 42_500 },
          { contract: 'ZCZ25', settle: 42_600 },
        ],
      })
    ).toThrow(/on the board twice/);
  });

  it('refuses a day it cannot read', () => {
    expect(() =>
      createQuoteBoard({ day: 'yesterday', quotes: [{ contract: 'ZCZ25', settle: 1 }] })
    ).toThrow(/YYYY-MM-DD/);
  });
});

describe('reading a settle', () => {
  it('finds a month by its symbol', () => {
    expect(settleOf(board, 'ZCZ25')).toBe(42_500);
    expect(settleOf(board, 'zch26')).toBe(44_000);
  });

  it('says what did settle when the month is missing', () => {
    try {
      settleOf(board, 'ZCU26');
    } catch (err) {
      expect(err.code).toBe('NO_QUOTE');
      expect(err.details.board).toContain('ZCH26');
    }
  });
});

describe('spreads', () => {
  it('counts the months between two contracts', () => {
    expect(monthsApart('ZCZ25', 'ZCH26')).toBe(3);
    expect(monthsApart('ZCZ25', 'ZCN26')).toBe(7);
    expect(monthsApart('ZCH26', 'ZCZ25')).toBe(-3);
  });

  it('calls a rising board a carry', () => {
    const result = spread(board, 'ZCZ25', 'ZCH26');
    expect(result.points).toBe(1500);
    expect(result.shape).toBe('carry');
    expect(result.perMonth).toBe(500);
  });

  it('calls a falling board an inverse', () => {
    const inverted = createQuoteBoard({
      day: '2025-10-09',
      quotes: [
        { contract: 'ZCZ25', settle: 44_000 },
        { contract: 'ZCH26', settle: 42_500 },
      ],
    });
    expect(spread(inverted, 'ZCZ25', 'ZCH26').shape).toBe('inverse');
  });

  it('calls two equal months flat', () => {
    const flat = createQuoteBoard({
      day: '2025-10-09',
      quotes: [
        { contract: 'ZCZ25', settle: 44_000 },
        { contract: 'ZCH26', settle: 44_000 },
      ],
    });
    expect(spread(flat, 'ZCZ25', 'ZCH26').shape).toBe('flat');
  });
});

describe('full carry', () => {
  it('adds storage and the interest on the money', () => {
    expect(
      carryCost({
        storagePointsPerMonth: 400,
        annualInterestRate: 0.08,
        pricePoints: 42_500,
        months: 3,
      })
    ).toBe(2050);
  });

  it('works out the share of full carry the board is paying', () => {
    const share = percentOfFullCarry(board, 'ZCZ25', 'ZCH26', {
      storagePointsPerMonth: 400,
      annualInterestRate: 0.08,
    });
    expect(share).toBe(73.2);
  });

  it('reads over a hundred when the board pays more than it costs', () => {
    const share = percentOfFullCarry(board, 'ZCZ25', 'ZCH26', {
      storagePointsPerMonth: 100,
      annualInterestRate: 0.04,
    });
    expect(share).toBeGreaterThan(100);
  });

  it('refuses to divide by a carry cost of nothing', () => {
    expect(() =>
      percentOfFullCarry(board, 'ZCZ25', 'ZCH26', {
        storagePointsPerMonth: 0,
        annualInterestRate: 0,
      })
    ).toThrow(/works out to nothing/);
  });
});

describe('printing the board', () => {
  it('lines the settles up in a column', () => {
    expect(renderBoard(board).split('\n')[0]).toBe('ZCZ25       4.2500');
  });
});
