import { describe, expect, it } from 'vitest';
import {
  bushelsFromDecimal,
  bushelsToDecimal,
  extend,
  formatBushels,
  formatMoney,
  formatPrice,
  parseMoney,
  parsePrice,
  priceFromDollars,
  priceToDollars,
} from '../src/core/money.js';
import { poundsToBushels } from '../src/core/units.js';
import { legalWeight } from '../src/commodity/registry.js';
import { applyDockage } from '../src/grading/dockage.js';
import { applyShrink } from '../src/weights/shrink.js';
import { settlementWeights } from '../src/weights/conversion.js';
import { roundHalfUp } from '../src/core/numbers.js';

/**
 * Properties rather than examples.
 *
 * The generator is a plain linear congruential one with a fixed seed, so the
 * same thousand cases run every time and a failure can be reproduced from the
 * seed alone. A test that draws different numbers on every run is a test that
 * fails on somebody else's machine and passes on yours.
 */

function generator(seed) {
  let state = seed;
  return (limit) => {
    state = (state * 1_664_525 + 1_013_904_223) % 4_294_967_296;
    return state % limit;
  };
}

const next = generator(20_251_009);

function someBushels() {
  return next(5_000_000) + 1;
}

function somePrice() {
  return next(150_000) + 1;
}

describe('money round trips', () => {
  it('parses back what it printed, a thousand times', () => {
    for (let round = 0; round < 1000; round += 1) {
      const points = somePrice();
      expect(parsePrice(formatPrice(points))).toBe(points);
    }
  });

  it('parses back money it printed', () => {
    for (let round = 0; round < 1000; round += 1) {
      const cents = next(100_000_000);
      expect(parseMoney(formatMoney(cents))).toBe(cents);
    }
  });

  it('converts dollars to points and back', () => {
    for (let round = 0; round < 500; round += 1) {
      const points = somePrice();
      expect(priceFromDollars(priceToDollars(points))).toBe(points);
    }
  });

  it('converts bushels both ways', () => {
    for (let round = 0; round < 500; round += 1) {
      const hundredths = someBushels();
      expect(bushelsFromDecimal(bushelsToDecimal(hundredths))).toBe(hundredths);
      expect(formatBushels(hundredths)).toMatch(/^\d[\d,]*\.\d\d$/);
    }
  });
});

describe('extending a load', () => {
  it('never disagrees with the same sum done the other way round', () => {
    for (let round = 0; round < 500; round += 1) {
      const points = somePrice();
      const bushels = someBushels();
      const cents = extend(points, bushels);
      const byHand = Math.round((points / 10_000) * (bushels / 100) * 100);
      expect(Math.abs(cents - byHand)).toBeLessThanOrEqual(1);
    }
  });

  it('scales linearly in the bushels to within the half cent it rounds at', () => {
    for (let round = 0; round < 200; round += 1) {
      const points = somePrice();
      const bushels = someBushels();
      const twice = extend(points, bushels) * 2;
      expect(Math.abs(extend(points, bushels * 2) - twice)).toBeLessThanOrEqual(1);
    }
  });

  it('is zero on an empty load whatever the price', () => {
    for (let round = 0; round < 100; round += 1) {
      expect(extend(somePrice(), 0)).toBe(0);
    }
  });
});

describe('the deductions always add back up', () => {
  it('splits dockage without losing a hundredth', () => {
    for (let round = 0; round < 500; round += 1) {
      const bushels = someBushels();
      const percent = roundHalfUp(next(1000) / 100, 1);
      const split = applyDockage(bushels, percent);
      expect(split.netBushels + split.dockageBushels).toBe(bushels);
      expect(split.dockageBushels).toBeGreaterThanOrEqual(0);
      expect(split.netBushels).toBeGreaterThanOrEqual(0);
    }
  });

  it('splits shrink without losing a hundredth', () => {
    for (let round = 0; round < 500; round += 1) {
      const bushels = someBushels();
      const percent = roundHalfUp(next(1500) / 100, 2);
      const split = applyShrink(bushels, percent);
      expect(split.netBushels + split.shrinkBushels).toBe(bushels);
    }
  });
});

describe('the settlement weight path', () => {
  it('never settles more bushels than came across the scale', () => {
    for (let round = 0; round < 500; round += 1) {
      const pounds = next(90_000) + 1000;
      const moisture = roundHalfUp(10 + next(1500) / 100, 1);
      const dockage = roundHalfUp(next(500) / 100, 1);
      const result = settlementWeights({
        commodity: 'corn',
        netPounds: pounds,
        moisture,
        dockagePercent: dockage,
      });
      expect(result.netBushels).toBeLessThanOrEqual(result.grossBushels);
      expect(result.netBushels).toBeGreaterThanOrEqual(0);
      expect(result.grossBushels).toBe(poundsToBushels(pounds, legalWeight('corn')));
    }
  });

  it('takes nothing at all off a dry clean load', () => {
    for (let round = 0; round < 200; round += 1) {
      const pounds = next(90_000) + 1000;
      const result = settlementWeights({ commodity: 'corn', netPounds: pounds, moisture: 14 });
      expect(result.netBushels).toBe(result.grossBushels);
    }
  });

  it('never settles a wetter load higher than a drier one of the same weight', () => {
    for (let round = 0; round < 200; round += 1) {
      const pounds = next(90_000) + 1000;
      const drier = settlementWeights({ commodity: 'corn', netPounds: pounds, moisture: 16 });
      const wetter = settlementWeights({ commodity: 'corn', netPounds: pounds, moisture: 20 });
      expect(wetter.netBushels).toBeLessThanOrEqual(drier.netBushels);
    }
  });
});
