import { describe, expect, it } from 'vitest';
import { basisFor } from '../../src/pricing/basis.js';
import {
  boardFor,
  buildBasisBook,
  commoditiesQuoted,
  periodsFor,
  quoteFor,
} from '../../src/pricing/basisbook.js';

const rows = [
  { commodity: 'corn', period: '2025-10', contract: 'ZCZ25', basisPoints: -3500 },
  { commodity: 'corn', period: '2025-12', contract: 'ZCZ25', basisPoints: -3000 },
  { commodity: 'soybeans', period: '2025-10', contract: 'ZSX25', basisPoints: -8500 },
];

const book = buildBasisBook(rows, { house: 'Rush Creek', day: '2025-10-09' });

describe('building a book', () => {
  it('makes one board a commodity', () => {
    expect(commoditiesQuoted(book).sort()).toEqual(['corn', 'soybeans']);
    expect(book.boards.corn.quotes).toHaveLength(2);
    expect(book.boards.soybeans.quotes).toHaveLength(1);
  });

  it('carries the house and the day onto every board', () => {
    expect(book.boards.corn.house).toBe('Rush Creek');
    expect(book.boards.soybeans.day).toBe('2025-10-09');
  });

  it('freezes what it built', () => {
    expect(Object.isFrozen(book)).toBe(true);
    expect(Object.isFrozen(book.boards)).toBe(true);
  });

  it('refuses a commodity the house does not take', () => {
    expect(() =>
      buildBasisBook([{ ...rows[0], commodity: 'oats' }], { house: 'x', day: '2025-10-09' })
    ).toThrow(/must be one of/);
  });

  it('refuses an empty book', () => {
    expect(() => buildBasisBook([], { house: 'x', day: '2025-10-09' })).toThrow(/at least 1/);
  });
});

describe('reading a book', () => {
  it('finds the board for a commodity', () => {
    expect(basisFor(boardFor(book, 'corn'), '2025-10')).toBe(-3500);
    expect(basisFor(boardFor(book, 'soybeans'), '2025-10')).toBe(-8500);
  });

  it('says what is posted when a commodity is not', () => {
    try {
      boardFor(book, 'hrw');
    } catch (err) {
      expect(err.code).toBe('NO_BASIS_FOR_COMMODITY');
      expect(err.details.posted).toEqual(['corn', 'soybeans']);
    }
  });

  it('lists the periods for a commodity', () => {
    expect(periodsFor(book, 'corn')).toEqual(['2025-10', '2025-12']);
  });

  it('finds a quote by commodity and period', () => {
    expect(quoteFor(book, 'corn', '2025-12').basisPoints).toBe(-3000);
  });

  it('says which periods are quoted when the one asked for is not', () => {
    try {
      quoteFor(book, 'corn', '2026-07');
    } catch (err) {
      expect(err.code).toBe('NO_BASIS_QUOTE');
      expect(err.details.quoted).toEqual(['2025-10', '2025-12']);
    }
  });

  it('does not let one commodity read another ones basis', () => {
    expect(basisFor(boardFor(book, 'corn'), '2025-10')).not.toBe(
      basisFor(boardFor(book, 'soybeans'), '2025-10')
    );
  });
});
