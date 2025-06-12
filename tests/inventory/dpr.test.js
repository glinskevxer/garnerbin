import { describe, expect, it } from 'vitest';
import { formatBushels } from '../../src/core/money.js';
import { buildPosition } from '../../src/inventory/position.js';
import { buildDpr, dprFor, renderDpr, unhedgedExceeds } from '../../src/inventory/dpr.js';

const corn = buildPosition({
  commodity: 'corn',
  inventory: 120_000_000,
  openStorage: 30_000_000,
  receipts: 10_000_000,
  purchasesOpen: 5_000_000,
  salesOpen: 40_000_000,
  futuresShort: 40_000_000,
});

const beans = buildPosition({
  commodity: 'soybeans',
  inventory: 20_000_000,
  openStorage: 5_000_000,
  salesOpen: 15_000_000,
  futuresShort: 0,
});

describe('buildDpr', () => {
  const report = buildDpr({ day: '2025-11-14', house: 'Rush Creek', positions: [corn, beans] });

  it('gives a row for each commodity', () => {
    expect(report.rows).toHaveLength(2);
    expect(report.rows[0].commodity).toBe('corn');
    expect(report.rows[0].houseOwned).toBe('800,000.00');
  });

  it('folds open storage and receipts into one grower column', () => {
    expect(report.rows[0].growerOwned).toBe('400,000.00');
  });

  it('says what the desk has to do', () => {
    expect(report.rows[0].action).toBe('sell 10');
    expect(report.rows[1].action).toBe('square');
  });

  it('totals the house', () => {
    expect(formatBushels(report.totals.net)).toBe('450,000.00');
    expect(formatBushels(report.totals.inventory)).toBe('1,400,000.00');
  });

  it('refuses a report with no positions', () => {
    expect(() => buildDpr({ day: '2025-11-14', positions: [] })).toThrow(/at least 1/);
  });

  it('refuses a day it cannot read', () => {
    expect(() => buildDpr({ day: 'today', positions: [corn] })).toThrow(/YYYY-MM-DD/);
  });
});

describe('renderDpr', () => {
  const text = dprFor({ day: '2025-11-14', house: 'Rush Creek', positions: [corn, beans] });

  it('heads the sheet with the house and the day', () => {
    expect(text).toContain('Rush Creek daily position 2025-11-14');
  });

  it('prints the two columns the lender reads', () => {
    expect(text).toContain('unhedged');
    expect(text).toMatch(/Unhedged +50,000\.00/);
  });

  it('renders from a built report too', () => {
    expect(renderDpr(buildDpr({ day: '2025-11-14', positions: [corn] }))).toContain(
      'unnamed house'
    );
  });
});

describe('the covenant', () => {
  it('reads over the limit when the house is exposed', () => {
    const report = buildDpr({ day: '2025-11-14', positions: [corn, beans] });
    expect(unhedgedExceeds(report, 4_000_000)).toBe(true);
    expect(unhedgedExceeds(report, 6_000_000)).toBe(false);
  });
});
