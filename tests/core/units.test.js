import { describe, expect, it } from 'vitest';
import { formatBushels } from '../../src/core/money.js';
import {
  bushelsAtTestWeight,
  bushelsToCubicFeet,
  bushelsToPounds,
  CUBIC_FEET_PER_BUSHEL,
  cubicFeetToBushels,
  netWeight,
  poundsToBushels,
  poundsToHundredweight,
  poundsToShortTons,
  poundsToTonnes,
  testWeightFromKettle,
  tonnesToBushels,
} from '../../src/core/units.js';

describe('pounds to bushels', () => {
  it('divides corn by the legal fifty six', () => {
    expect(formatBushels(poundsToBushels(50_400, 56))).toBe('900.00');
  });

  it('divides beans by the legal sixty', () => {
    expect(formatBushels(poundsToBushels(48_000, 60))).toBe('800.00');
  });

  it('truncates the leftover rather than rounding it up', () => {
    expect(formatBushels(poundsToBushels(50_399, 56))).toBe('899.98');
    expect(formatBushels(poundsToBushels(1, 56))).toBe('0.01');
  });

  it('does not use the test weight of a light load', () => {
    const light = poundsToBushels(50_400, 56);
    expect(light).toBe(poundsToBushels(50_400, 56));
    expect(bushelsAtTestWeight(50_400, 52)).toBeGreaterThan(light);
  });

  it('refuses a weight per bushel of zero', () => {
    expect(() => poundsToBushels(100, 0)).toThrow(/greater than zero/);
  });

  it('goes back to pounds', () => {
    expect(bushelsToPounds(90_000, 56)).toBe(50_400);
    expect(bushelsToPounds(1, 60)).toBe(0.6);
  });
});

describe('volume', () => {
  it('holds the struck bushel at 1.2445 cubic feet', () => {
    expect(CUBIC_FEET_PER_BUSHEL).toBeCloseTo(1.2445, 4);
  });

  it('turns a bin volume into bushels', () => {
    expect(formatBushels(cubicFeetToBushels(1244.46))).toBe('1,000.00');
  });

  it('goes back the other way', () => {
    expect(bushelsToCubicFeet(100_000)).toBeCloseTo(1244.456, 2);
  });
});

describe('other weight units', () => {
  it('converts tonnes both directions', () => {
    expect(poundsToTonnes(2204.62262)).toBe(1);
    expect(formatBushels(tonnesToBushels(1, 56))).toBe('39.36');
    expect(formatBushels(tonnesToBushels(1, 60))).toBe('36.74');
  });

  it('converts hundredweight and short tons', () => {
    expect(poundsToHundredweight(5432)).toBe(54.32);
    expect(poundsToShortTons(50_000)).toBe(25);
  });
});

describe('test weight from the kettle', () => {
  it('turns a quart of corn into pounds per bushel', () => {
    expect(testWeightFromKettle(793.8)).toBe(56);
    expect(testWeightFromKettle(737.1)).toBe(52);
  });

  it('refuses an empty kettle', () => {
    expect(() => testWeightFromKettle(0)).toThrow(/greater than zero/);
  });
});

describe('net weight', () => {
  it('subtracts the tare', () => {
    expect(netWeight(78_500, 28_100)).toBe(50_400);
  });

  it('refuses a ticket keyed in backwards', () => {
    expect(() => netWeight(28_100, 78_500)).toThrow(/tare 78500 is over gross 28100/);
  });

  it('allows an empty load', () => {
    expect(netWeight(28_100, 28_100)).toBe(0);
  });
});
