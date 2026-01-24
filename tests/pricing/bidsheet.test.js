import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { formatPrice } from '../../src/core/money.js';
import { importBasisBook, importQuoteBoard } from '../../src/io/importers.js';
import { bidFor, buildBidSheet, renderBidSheet, spotBid } from '../../src/pricing/bidsheet.js';

const read = (name) => readFileSync(new URL(`../../examples/${name}`, import.meta.url), 'utf8');
const board = importQuoteBoard(read('board-2025-10-09.csv'), '2025-10-09');
const basis = importBasisBook(read('basis-2025-10-09.csv'), {
  house: 'Rush Creek Grain',
  day: '2025-10-09',
});

const sheet = buildBidSheet({
  house: 'Rush Creek Grain',
  day: '2025-10-09',
  board,
  basis,
});

describe('building the sheet', () => {
  it('quotes every period on the basis book that the board can price', () => {
    expect(sheet.rows.length).toBeGreaterThan(4);
    expect(new Set(sheet.rows.map((row) => row.commodity))).toEqual(
      new Set(['corn', 'soybeans', 'hrw'])
    );
  });

  it('adds the board and the basis', () => {
    const october = sheet.rows.find((row) => row.commodity === 'corn' && row.period === '2025-10');
    expect(october.settlePoints).toBe(42_500);
    expect(october.basisPoints).toBe(-3500);
    expect(october.bidPoints).toBe(39_000);
  });

  it('sorts by grain then by delivery', () => {
    const corn = sheet.rows.filter((row) => row.commodity === 'corn');
    expect(corn.map((row) => row.period)).toEqual(['2025-10', '2025-12', '2026-03', '2026-05']);
  });

  it('reports a period the board cannot price rather than dropping it silently', () => {
    const thin = importQuoteBoard('contract,settle\nZCZ25,4.2500\n', '2025-10-09');
    const partial = buildBidSheet({ house: 'x', day: '2025-10-09', board: thin, basis });
    expect(partial.rows.every((row) => row.month === 'ZCZ25')).toBe(true);
    expect(partial.problems.length).toBeGreaterThan(0);
    expect(partial.problems[0]).toContain('the board has no');
  });

  it('narrows to the commodities asked for', () => {
    const cornOnly = buildBidSheet({
      house: 'x',
      day: '2025-10-09',
      board,
      basis,
      commodities: ['corn'],
    });
    expect(new Set(cornOnly.rows.map((row) => row.commodity))).toEqual(new Set(['corn']));
  });

  it('says so when a commodity has no basis posted', () => {
    const sheetWithGap = buildBidSheet({
      house: 'x',
      day: '2025-10-09',
      board,
      basis,
      commodities: ['corn', 'sorghum'],
    });
    expect(sheetWithGap.problems.some((problem) => problem.includes('sorghum'))).toBe(true);
  });

  it('refuses a sheet where nothing can be priced', () => {
    const empty = importQuoteBoard('contract,settle\nZWZ25,5.0000\n', '2025-10-09');
    expect(() => buildBidSheet({ house: 'x', day: '2025-10-09', board: empty, basis })).toThrow(
      /nothing on the basis book could be priced/
    );
  });
});

describe('reading a bid off the sheet', () => {
  it('finds one by grain and period', () => {
    expect(formatPrice(bidFor(sheet, 'corn', '2026-03'))).toBe('4.1500');
  });

  it('says what is quoted when it cannot find one', () => {
    try {
      bidFor(sheet, 'corn', '2027-01');
    } catch (err) {
      expect(err.code).toBe('NOT_ON_THE_SHEET');
      expect(err.details.quoted).toContain('corn 2025-10');
    }
  });

  it('takes the nearest period as the spot bid', () => {
    expect(spotBid(sheet, 'corn')).toBe(39_000);
    expect(() => spotBid(sheet, 'sorghum')).toThrow(/is not quoted today/);
  });
});

describe('printing the sheet', () => {
  it('lays the columns out for the wall', () => {
    const text = renderBidSheet(sheet);
    expect(text).toContain('Rush Creek Grain bids for 2025-10-09');
    expect(text).toContain('Yellow corn');
    expect(text).toContain('-0.35');
  });

  it('lists what could not be quoted', () => {
    const thin = importQuoteBoard('contract,settle\nZCZ25,4.2500\n', '2025-10-09');
    const partial = buildBidSheet({ house: 'x', day: '2025-10-09', board: thin, basis });
    expect(renderBidSheet(partial)).toContain('Not quoted today:');
  });
});
