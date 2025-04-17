import { describe, expect, it } from 'vitest';
import { formatPrice } from '../../src/core/money.js';
import {
  basisCarry,
  basisFor,
  basisMove,
  bestBasis,
  bidFrom,
  cashBid,
  createBasisBoard,
  formatBasis,
  quoteFor,
} from '../../src/pricing/basis.js';

const board = createBasisBoard({
  house: 'Rush Creek',
  commodity: 'corn',
  day: '2025-10-09',
  quotes: [
    { period: '2025-10', contract: 'ZCZ25', basisPoints: -3500 },
    { period: '2025-12', contract: 'ZCZ25', basisPoints: -3000 },
    { period: '2026-03', contract: 'ZCH26', basisPoints: -2500 },
  ],
});

describe('building a basis board', () => {
  it('keeps the quotes with their contract months', () => {
    expect(board.quotes).toHaveLength(3);
    expect(quoteFor(board, '2025-12').contract.month).toBe(12);
    expect(Object.isFrozen(board)).toBe(true);
  });

  it('refuses a period it cannot read', () => {
    expect(() =>
      createBasisBoard({
        ...boardInput(),
        quotes: [{ period: 'october', contract: 'ZCZ25', basisPoints: -3500 }],
      })
    ).toThrow(/not a delivery period/);
  });

  it('refuses the same period twice', () => {
    expect(() =>
      createBasisBoard({
        ...boardInput(),
        quotes: [
          { period: '2025-10', contract: 'ZCZ25', basisPoints: -3500 },
          { period: '2025-10', contract: 'ZCZ25', basisPoints: -3400 },
        ],
      })
    ).toThrow(/quoted twice/);
  });

  it('refuses a basis nobody would post', () => {
    expect(() =>
      createBasisBoard({
        ...boardInput(),
        quotes: [{ period: '2025-10', contract: 'ZCZ25', basisPoints: -40_000 }],
      })
    ).toThrow(/is not real/);
  });

  it('refuses an empty board', () => {
    expect(() => createBasisBoard({ ...boardInput(), quotes: [] })).toThrow(/at least 1/);
  });
});

function boardInput() {
  return { house: 'Rush Creek', commodity: 'corn', day: '2025-10-09', quotes: [] };
}

describe('reading a basis', () => {
  it('finds the quote for a period', () => {
    expect(basisFor(board, '2025-10')).toBe(-3500);
    expect(basisFor(board, '2026-03')).toBe(-2500);
  });

  it('says who does quote when it cannot find one', () => {
    try {
      basisFor(board, '2026-07');
    } catch (err) {
      expect(err.code).toBe('NO_BASIS_QUOTE');
      expect(err.details.quoted).toEqual(['2025-10', '2025-12', '2026-03']);
    }
  });

  it('prints a basis the way the board does', () => {
    expect(formatBasis(-3500)).toBe('-0.35');
    expect(formatBasis(1250)).toBe('+0.13');
    expect(formatBasis(0)).toBe('+0.00');
  });
});

describe('the posted bid', () => {
  it('is the board plus the basis', () => {
    expect(cashBid(46_250, -3500)).toBe(42_750);
    expect(formatPrice(bidFrom(board, '2025-10', 46_250))).toBe('4.2750');
  });

  it('lifts with a better deferred basis', () => {
    expect(bidFrom(board, '2026-03', 46_250)).toBeGreaterThan(bidFrom(board, '2025-10', 46_250));
  });
});

describe('basis moves', () => {
  it('calls a move toward zero a narrowing', () => {
    expect(basisMove(-3500, -3000)).toEqual({ change: 500, direction: 'narrowed' });
    expect(basisMove(-3000, -3500)).toEqual({ change: -500, direction: 'widened' });
    expect(basisMove(-3000, -3000).direction).toBe('flat');
  });

  it('measures the carry the board is offering', () => {
    expect(basisCarry(board, '2025-10', '2025-12')).toBe(500);
    expect(basisCarry(board, '2025-10', '2026-03')).toBe(1000);
  });
});

describe('shopping the basis', () => {
  const rival = createBasisBoard({
    house: 'Kell Junction',
    commodity: 'corn',
    day: '2025-10-09',
    quotes: [{ period: '2025-10', contract: 'ZCZ25', basisPoints: -3200 }],
  });

  it('finds the house paying the most', () => {
    expect(bestBasis([board, rival], '2025-10')).toEqual({
      house: 'Kell Junction',
      basisPoints: -3200,
    });
  });

  it('ignores a house that does not quote the period', () => {
    expect(bestBasis([board, rival], '2026-03').house).toBe('Rush Creek');
  });

  it('says so when nobody quotes it', () => {
    expect(() => bestBasis([board, rival], '2027-01')).toThrow(/no board quotes 2027-01/);
  });
});
