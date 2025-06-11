import { describe, expect, it } from 'vitest';
import { formatBushels } from '../../src/core/money.js';
import {
  buildPosition,
  contractsFor,
  hedgeGap,
  isSquare,
  positionLine,
  totalNet,
} from '../../src/inventory/position.js';

const position = buildPosition({
  commodity: 'corn',
  inventory: 120_000_000,
  openStorage: 30_000_000,
  receipts: 10_000_000,
  purchasesOpen: 5_000_000,
  salesOpen: 40_000_000,
  futuresShort: 40_000_000,
});

describe('building a position', () => {
  it('takes the growers grain out of what the house owns', () => {
    expect(formatBushels(position.houseOwned)).toBe('800,000.00');
  });

  it('adds open purchases to the long side', () => {
    expect(formatBushels(position.longBushels)).toBe('850,000.00');
    expect(formatBushels(position.shortBushels)).toBe('400,000.00');
  });

  it('nets the two sides and names the direction', () => {
    expect(formatBushels(position.netBushels)).toBe('450,000.00');
    expect(position.direction).toBe('long');
  });

  it('calls a house that has sold more than it owns short', () => {
    const oversold = buildPosition({ commodity: 'corn', inventory: 10_000, salesOpen: 50_000 });
    expect(oversold.direction).toBe('short');
    expect(oversold.netBushels).toBe(-40_000);
  });

  it('calls a balanced house flat', () => {
    expect(buildPosition({ commodity: 'corn' }).direction).toBe('flat');
  });

  it('measures what the futures actually cover', () => {
    expect(formatBushels(position.hedgedBushels)).toBe('400,000.00');
    expect(formatBushels(position.unhedgedBushels)).toBe('50,000.00');
    expect(position.hedgeRatio).toBe(88.9);
  });

  it('counts a long futures leg against the short one', () => {
    const spread = buildPosition({
      commodity: 'corn',
      inventory: 10_000_000,
      futuresShort: 10_000_000,
      futuresLong: 4_000_000,
    });
    expect(spread.hedgedBushels).toBe(6_000_000);
    expect(spread.unhedgedBushels).toBe(4_000_000);
  });

  it('refuses a commodity it does not take', () => {
    expect(() => buildPosition({ commodity: 'oats' })).toThrow(/must be one of/);
  });
});

describe('turning bushels into contracts', () => {
  it('counts whole five thousand bushel contracts', () => {
    expect(contractsFor(50_000_000, 'corn')).toEqual({
      contracts: 100,
      remainder: 0,
      contractBushels: 500_000,
    });
  });

  it('leaves the odd lot as a remainder', () => {
    const result = contractsFor(52_300_000, 'corn');
    expect(result.contracts).toBe(104);
    expect(formatBushels(result.remainder)).toBe('3,000.00');
  });
});

describe('the hedge gap', () => {
  it('tells a long desk to sell', () => {
    const gap = hedgeGap(position);
    expect(gap.action).toBe('sell');
    expect(gap.contracts).toBe(10);
    expect(gap.uncoveredBushels).toBe(0);
  });

  it('tells a short desk to buy', () => {
    const short = buildPosition({ commodity: 'corn', inventory: 0, salesOpen: 50_000_000 });
    expect(hedgeGap(short).action).toBe('buy');
    expect(hedgeGap(short).contracts).toBe(100);
  });

  it('leaves the odd lot uncovered', () => {
    const odd = buildPosition({ commodity: 'corn', inventory: 52_300_000 });
    expect(hedgeGap(odd).contracts).toBe(104);
    expect(formatBushels(hedgeGap(odd).uncoveredBushels)).toBe('3,000.00');
  });

  it('says nothing to do when the desk is square', () => {
    const square = buildPosition({
      commodity: 'corn',
      inventory: 50_000_000,
      futuresShort: 50_000_000,
    });
    expect(hedgeGap(square).action).toBe('none');
    expect(isSquare(square)).toBe(true);
    expect(isSquare(position)).toBe(false);
    expect(isSquare(position, 5_000_000)).toBe(true);
  });
});

describe('printing', () => {
  it('gives one line for the report', () => {
    expect(positionLine(position)).toMatch(/^corn +450,000\.00 +long +50,000\.00$/);
  });

  it('totals a set of positions', () => {
    const beans = buildPosition({ commodity: 'soybeans', inventory: 10_000_000 });
    expect(totalNet([position, beans])).toBe(55_000_000);
  });
});
