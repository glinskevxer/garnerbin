import { describe, expect, it } from 'vitest';
import {
  addMoney,
  bushelsFromDecimal,
  bushelsToDecimal,
  chargePerBushel,
  extend,
  formatBoardPrice,
  formatBushels,
  formatMoney,
  formatPrice,
  parseBoardPrice,
  parseMoney,
  parsePrice,
  priceFromDollars,
  priceToDollars,
  QUARTER_CENT_POINTS,
} from '../../src/core/money.js';

describe('prices in points', () => {
  it('turns a dollar bid into whole points', () => {
    expect(priceFromDollars(4.625)).toBe(46250);
    expect(priceFromDollars(11.87)).toBe(118700);
    expect(priceToDollars(46250)).toBe(4.625);
  });

  it('puts a quarter cent on a whole tick', () => {
    expect(QUARTER_CENT_POINTS).toBe(25);
    expect(priceFromDollars(4.6275) - priceFromDollars(4.625)).toBe(QUARTER_CENT_POINTS);
  });

  it('reads a plain decimal bid', () => {
    expect(parsePrice('4.6250')).toBe(46250);
    expect(parsePrice('$4.62')).toBe(46200);
    expect(parsePrice(' 11 ')).toBe(110000);
    expect(parsePrice('-0.35')).toBe(-3500);
  });

  it('refuses a bid it cannot read', () => {
    expect(() => parsePrice('four dollars')).toThrow(/cannot read/);
    expect(() => parsePrice('4.62501')).toThrow(/cannot read/);
  });

  it('refuses a price past the board limit', () => {
    expect(() => priceFromDollars(99_999)).toThrow(/not usable/);
  });

  it('prints a price back at the width asked for', () => {
    expect(formatPrice(46250)).toBe('4.6250');
    expect(formatPrice(46250, 2)).toBe('4.62');
    expect(formatPrice(-3500)).toBe('-0.3500');
    expect(formatPrice(46250, 0)).toBe('4');
  });
});

describe('board notation', () => {
  it('reads cents and eighths', () => {
    expect(parseBoardPrice("462'4")).toBe(46250);
    expect(parseBoardPrice("1187'2")).toBe(118725);
    expect(parseBoardPrice("462'0")).toBe(46200);
  });

  it('refuses an eighth that is not a tick', () => {
    expect(() => parseBoardPrice("462'8")).toThrow(/not board notation/);
    expect(() => parseBoardPrice('462.4')).toThrow(/not board notation/);
  });

  it('prints board notation back', () => {
    expect(formatBoardPrice(46250)).toBe("462'4");
    expect(formatBoardPrice(118725)).toBe("1187'2");
    expect(formatBoardPrice(-1250)).toBe("-12'4");
  });

  it('will not print a price that is off the eighth', () => {
    expect(() => formatBoardPrice(46251)).toThrow(/not on an eighth/);
  });

  it('round trips the quarter cent ticks the grains actually trade', () => {
    for (const eighth of [0, 2, 4, 6]) {
      const text = `462'${eighth}`;
      expect(formatBoardPrice(parseBoardPrice(text))).toBe(text);
    }
  });

  it('refuses an odd eighth, which is not an outright grain tick', () => {
    for (const eighth of [1, 3, 5, 7]) {
      expect(() => parseBoardPrice(`462'${eighth}`)).toThrow(/not on a tradeable tick/);
    }
  });
});

describe('money in cents', () => {
  it('reads and prints dollars', () => {
    expect(parseMoney('1234.56')).toBe(123456);
    expect(parseMoney('$1,234.56')).toBe(123456);
    expect(parseMoney('-12')).toBe(-1200);
    expect(formatMoney(123456)).toBe('1,234.56');
    expect(formatMoney(123456, { grouped: false })).toBe('1234.56');
    expect(formatMoney(-500)).toBe('-5.00');
    expect(formatMoney(500, { sign: true })).toBe('+5.00');
  });

  it('refuses money text it cannot read', () => {
    expect(() => parseMoney('1.234')).toThrow(/cannot read/);
  });

  it('adds without drift', () => {
    expect(addMoney(123456, -456, 1)).toBe(123001);
  });
});

describe('bushels in hundredths', () => {
  it('converts both ways', () => {
    expect(bushelsFromDecimal(1234.56)).toBe(123456);
    expect(bushelsToDecimal(123456)).toBe(1234.56);
    expect(formatBushels(123456)).toBe('1,234.56');
    expect(formatBushels(-5)).toBe('-0.05');
  });
});

describe('extending a load', () => {
  it('multiplies a bid by bushels and lands on cents', () => {
    expect(extend(46250, 123456)).toBe(570_984);
    expect(formatMoney(extend(46250, 123456))).toBe('5,709.84');
  });

  it('rounds the last half cent away from zero', () => {
    expect(extend(1, 15)).toBe(0);
    expect(extend(1, 50_000)).toBe(5);
    expect(extend(-46250, 123456)).toBe(-570_984);
  });

  it('runs per bushel charges down the same path', () => {
    expect(chargePerBushel(400, 123456)).toBe(4938);
  });
});
