import { describe, expect, it } from 'vitest';
import {
  DEFAULT_TOLERANCE_PERCENT,
  describeVariance,
  reconcile,
  reconcileSeries,
  seasonVariance,
  shrinkCaptured,
  withinTolerance,
  worstVariance,
} from '../../src/weights/reconcile.js';

describe('reconcile', () => {
  it('builds the book figure from the tickets', () => {
    const result = reconcile({
      opening: 1_000_000,
      receipts: 5_000_000,
      shipments: 2_000_000,
      measured: 4_000_000,
    });
    expect(result.book).toBe(4_000_000);
    expect(result.variance).toBe(0);
    expect(result.direction).toBe('flat');
  });

  it('calls a heavy bin over and a light one short', () => {
    const over = reconcile({ receipts: 1_000_000, measured: 1_002_000 });
    expect(over.direction).toBe('over');
    expect(over.variance).toBe(2000);
    expect(over.variancePercent).toBe(0.2);

    const short = reconcile({ receipts: 1_000_000, measured: 995_000 });
    expect(short.direction).toBe('short');
    expect(short.variancePercent).toBe(-0.5);
  });

  it('carries an adjustment into the book figure', () => {
    const result = reconcile({ receipts: 1_000_000, adjustments: -5000, measured: 995_000 });
    expect(result.book).toBe(995_000);
    expect(result.variance).toBe(0);
  });

  it('can measure the variance against everything handled', () => {
    const result = reconcile({
      receipts: 1_000_000,
      shipments: 1_000_000,
      measured: 2000,
      varianceBasis: 'handled',
    });
    expect(result.variancePercent).toBe(0.1);
  });

  it('refuses negative receipts', () => {
    expect(() => reconcile({ receipts: -1, measured: 0 })).toThrow(/not be negative/);
  });
});

describe('tolerance', () => {
  it('passes a house inside half a percent', () => {
    expect(DEFAULT_TOLERANCE_PERCENT).toBe(0.5);
    expect(withinTolerance(reconcile({ receipts: 1_000_000, measured: 1_004_000 }))).toBe(true);
    expect(withinTolerance(reconcile({ receipts: 1_000_000, measured: 1_006_000 }))).toBe(false);
  });

  it('takes a tighter tolerance when asked', () => {
    const result = reconcile({ receipts: 1_000_000, measured: 1_003_000 });
    expect(withinTolerance(result, 0.2)).toBe(false);
  });

  it('says what happened in words', () => {
    expect(describeVariance(reconcile({ receipts: 1_000_000, measured: 1_002_000 }))).toBe(
      '20.00 bushels over at 0.200 percent'
    );
    expect(describeVariance(reconcile({ receipts: 100, measured: 100 }))).toBe(
      'book and measured agree'
    );
  });
});

describe('shrink captured', () => {
  it('compares what was charged against what actually left', () => {
    const result = shrinkCaptured({
      grossReceipts: 1_000_000,
      settledReceipts: 958_000,
      measuredReceipts: 965_000,
    });
    expect(result.charged).toBe(42_000);
    expect(result.actual).toBe(35_000);
    expect(result.margin).toBe(7000);
  });

  it('leaves the margin unknown when nobody measured', () => {
    const result = shrinkCaptured({ grossReceipts: 1_000_000, settledReceipts: 958_000 });
    expect(result.charged).toBe(42_000);
    expect(result.margin).toBeNull();
  });
});

describe('a season of reconciliations', () => {
  const days = [
    { day: '2025-10-01', receipts: 500_000, shipments: 0, measured: 498_000 },
    { day: '2025-10-02', receipts: 400_000, shipments: 100_000, measured: 800_000 },
    { day: '2025-10-03', receipts: 300_000, shipments: 200_000, measured: 895_000 },
  ];

  it('carries the measured figure forward', () => {
    const rows = reconcileSeries(days);
    expect(rows[1].opening).toBe(498_000);
    expect(rows[1].book).toBe(798_000);
    expect(rows[1].variance).toBe(2000);
  });

  it('can carry the book figure instead', () => {
    const rows = reconcileSeries(days, { carry: 'book' });
    expect(rows[1].opening).toBe(500_000);
  });

  it('finds the day that ran furthest off', () => {
    const rows = reconcileSeries(days);
    expect(worstVariance(rows).day).toBe('2025-10-03');
  });

  it('adds the season up', () => {
    const season = seasonVariance(reconcileSeries(days));
    expect(season.days).toBe(3);
    expect(season.receipts).toBe(1_200_000);
    expect(season.variance).toBe(-5000);
  });

  it('refuses to rank nothing', () => {
    expect(() => worstVariance([])).toThrow(/no reconciliation rows/);
  });
});
