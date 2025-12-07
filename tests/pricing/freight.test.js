import { describe, expect, it } from 'vitest';
import { formatPrice } from '../../src/core/money.js';
import {
  bestDestination,
  compareDestinations,
  createFreightRate,
  deliveredFrom,
  describeNetback,
  freightPoints,
  netback,
  pointsPerMile,
  RATE_KINDS,
} from '../../src/pricing/freight.js';

const load = { bushels: 900, commodity: 'corn' };

const perBushel = createFreightRate({
  id: 'F-1',
  destination: 'Blair NE',
  kind: 'perBushel',
  points: 1800,
  miles: 96,
});

const perMile = createFreightRate({
  id: 'F-2',
  destination: 'Atchison KS',
  kind: 'perMile',
  dollarsPerMile: 3.4,
  miles: 48,
});

const perTonMile = createFreightRate({
  id: 'F-3',
  destination: 'Council Bluffs IA',
  kind: 'perTonMile',
  dollarsPerTonMile: 0.16,
  miles: 120,
});

const flat = createFreightRate({
  id: 'F-4',
  destination: 'the river',
  kind: 'flat',
  dollars: 210,
});

describe('building a rate', () => {
  it('takes the four shapes', () => {
    expect(RATE_KINDS).toEqual(['perBushel', 'perMile', 'perTonMile', 'flat']);
    expect(() => createFreightRate({ id: 'x', destination: 'y', kind: 'perHour' })).toThrow(
      /must be one of/
    );
  });

  it('needs the miles on a distance rate', () => {
    expect(() =>
      createFreightRate({ id: 'x', destination: 'y', kind: 'perMile', dollarsPerMile: 3 })
    ).toThrow(/needs the miles/);
  });

  it('does not need the miles on a flat or per bushel rate', () => {
    expect(
      createFreightRate({ id: 'x', destination: 'y', kind: 'flat', dollars: 100 }).miles
    ).toBeNull();
  });
});

describe('freight in points a bushel', () => {
  it('takes a per bushel rate straight', () => {
    expect(freightPoints(perBushel, load)).toBe(1800);
  });

  it('spreads a per mile rate over the load', () => {
    expect(freightPoints(perMile, load)).toBe(1813);
    expect(formatPrice(freightPoints(perMile, load))).toBe('0.1813');
  });

  it('works a per ton mile rate off the legal weight', () => {
    expect(freightPoints(perTonMile, load)).toBe(4877);
  });

  it('spreads a flat rate over the load', () => {
    expect(freightPoints(flat, load)).toBe(2333);
    expect(freightPoints(flat, { ...load, bushels: 1800 })).toBe(1167);
  });

  it('adds a fuel surcharge', () => {
    const surcharged = createFreightRate({ ...toInput(perMile), fuelSurchargePercent: 12 });
    expect(freightPoints(surcharged, load)).toBeGreaterThan(freightPoints(perMile, load));
  });

  it('lifts a thin rate to the minimum', () => {
    const floored = createFreightRate({ ...toInput(perBushel), minimumPoints: 2500 });
    expect(freightPoints(floored, load)).toBe(2500);
  });

  it('refuses a load of nothing', () => {
    expect(() => freightPoints(perBushel, { bushels: 0 })).toThrow(/greater than zero/);
  });
});

function toInput(rate) {
  return {
    id: rate.id,
    destination: rate.destination,
    kind: rate.kind,
    points: rate.points,
    dollars: rate.dollars,
    dollarsPerMile: rate.dollarsPerMile,
    dollarsPerTonMile: rate.dollarsPerTonMile,
    miles: rate.miles,
  };
}

describe('netback', () => {
  it('works a delivered bid back to the pit', () => {
    expect(netback(46_000, 1800)).toBe(44_200);
    expect(deliveredFrom(44_200, 1800)).toBe(46_000);
  });

  it('ranks destinations by what they net, not by what they bid', () => {
    const rows = compareDestinations(
      [
        { rate: perBushel, deliveredPoints: 46_000 },
        { rate: perTonMile, deliveredPoints: 48_000 },
        { rate: flat, deliveredPoints: 45_500 },
      ],
      load
    );
    expect(rows[0].destination).toBe('Blair NE');
    expect(rows.map((row) => row.destination)).toEqual([
      'Blair NE',
      'the river',
      'Council Bluffs IA',
    ]);
    expect(rows[2].deliveredPoints).toBeGreaterThan(rows[0].deliveredPoints);
  });

  it('picks the best one', () => {
    const best = bestDestination(
      [
        { rate: perBushel, deliveredPoints: 46_000 },
        { rate: flat, deliveredPoints: 45_500 },
      ],
      load
    );
    expect(best.netbackPoints).toBe(44_200);
  });

  it('says it in words', () => {
    const row = bestDestination([{ rate: perBushel, deliveredPoints: 46_000 }], load);
    expect(describeNetback(row)).toBe(
      'Blair NE bids 4.6000 and nets 4.4200 after 0.1800 of freight'
    );
  });

  it('refuses an empty list', () => {
    expect(() => compareDestinations([], load)).toThrow(/at least 1/);
  });
});

describe('what a mile is worth', () => {
  it('divides the freight by the distance', () => {
    expect(pointsPerMile(perMile, load)).toBeCloseTo(37.8, 1);
  });

  it('answers nothing on a rate with no miles', () => {
    expect(pointsPerMile(flat, load)).toBe(0);
  });
});
