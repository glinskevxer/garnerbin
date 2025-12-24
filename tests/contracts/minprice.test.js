import { describe, expect, it } from 'vitest';
import { formatPrice } from '../../src/core/money.js';
import {
  breakEvenFutures,
  createOptionLeg,
  describeLeg,
  finalPrice,
  floorPrice,
  hasExpired,
  intrinsicValue,
  isInTheMoney,
  OPTION_KINDS,
  payoffTable,
  settleOption,
} from '../../src/contracts/minprice.js';

function leg(overrides = {}) {
  return createOptionLeg({
    id: 'O-9',
    kind: 'call',
    contract: 'ZCN26',
    strikePoints: 46_000,
    premiumPoints: 2200,
    boughtOn: '2025-11-03',
    expiresOn: '2026-06-19',
    bushels: 500_000,
    ...overrides,
  });
}

const cash = 42_750;

describe('building a leg', () => {
  it('takes calls and puts', () => {
    expect(OPTION_KINDS).toEqual(['call', 'put']);
    expect(() => leg({ kind: 'straddle' })).toThrow(/must be one of/);
  });

  it('refuses a premium of nothing', () => {
    expect(() => leg({ premiumPoints: 0 })).toThrow(/greater than zero/);
  });

  it('says what it is in one line', () => {
    expect(describeLeg(leg())).toBe('O-9: 4.6000 call on ZCN26 for 0.2200');
  });
});

describe('what the option is worth', () => {
  it('is nothing under the strike on a call', () => {
    expect(intrinsicValue(leg(), 44_000)).toBe(0);
    expect(isInTheMoney(leg(), 44_000)).toBe(false);
  });

  it('is the distance over the strike', () => {
    expect(intrinsicValue(leg(), 48_500)).toBe(2500);
    expect(isInTheMoney(leg(), 48_500)).toBe(true);
  });

  it('runs the other way on a put', () => {
    expect(intrinsicValue(leg({ kind: 'put' }), 44_000)).toBe(2000);
    expect(intrinsicValue(leg({ kind: 'put' }), 48_000)).toBe(0);
  });
});

describe('the floor', () => {
  it('is the cash price less the premium, not the strike', () => {
    expect(floorPrice(cash, leg())).toBe(40_550);
    expect(floorPrice(cash, leg())).not.toBe(leg().strikePoints);
    expect(formatPrice(floorPrice(cash, leg()))).toBe('4.0550');
  });

  it('holds when the board falls', () => {
    expect(finalPrice(cash, leg(), 38_000)).toBe(40_550);
  });

  it('lifts when the board rallies past the strike', () => {
    expect(finalPrice(cash, leg(), 48_500)).toBe(43_050);
  });

  it('needs a rally past the strike plus the premium to beat a cash sale', () => {
    const breakEven = breakEvenFutures(leg());
    expect(breakEven).toBe(48_200);
    expect(finalPrice(cash, leg(), breakEven)).toBe(cash);
    expect(finalPrice(cash, leg(), breakEven - 100)).toBeLessThan(cash);
    expect(finalPrice(cash, leg(), breakEven + 100)).toBeGreaterThan(cash);
  });

  it('runs the break even down on a put', () => {
    expect(breakEvenFutures(leg({ kind: 'put' }))).toBe(43_800);
  });
});

describe('settling', () => {
  it('exercises when it is in the money', () => {
    const result = settleOption(leg(), { futuresPoints: 48_500, day: '2026-06-19' });
    expect(result.outcome).toBe('exercised');
    expect(result.netPoints).toBe(300);
  });

  it('expires worthless when it is not', () => {
    const result = settleOption(leg(), { futuresPoints: 42_000, day: '2026-06-20' });
    expect(result.outcome).toBe('expired worthless');
    expect(result.netPoints).toBe(-2200);
  });

  it('is still open before expiry', () => {
    const result = settleOption(leg(), { futuresPoints: 42_000, day: '2026-03-01' });
    expect(result.outcome).toBe('still open');
  });

  it('knows when it has expired', () => {
    expect(hasExpired(leg(), '2026-06-19')).toBe(false);
    expect(hasExpired(leg(), '2026-06-20')).toBe(true);
  });

  it('refuses to settle before it was bought', () => {
    expect(() => settleOption(leg(), { futuresPoints: 42_000, day: '2025-01-01' })).toThrow(
      /is before O-9 was bought/
    );
  });
});

describe('the payoff table', () => {
  it('walks a range of finishes', () => {
    const rows = payoffTable(cash, leg(), 40_000, 50_000, 2500);
    expect(rows).toHaveLength(5);
    expect(rows[0].pricePoints).toBe(40_550);
    expect(rows.at(-1).pricePoints).toBe(44_550);
  });

  it('is flat below the strike and rising above it', () => {
    const rows = payoffTable(cash, leg(), 40_000, 50_000, 2500);
    expect(rows[0].pricePoints).toBe(rows[1].pricePoints);
    expect(rows.at(-1).pricePoints).toBeGreaterThan(rows[2].pricePoints);
  });
});
