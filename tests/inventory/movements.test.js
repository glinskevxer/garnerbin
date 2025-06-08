import { describe, expect, it } from 'vitest';
import { formatBushels } from '../../src/core/money.js';
import { capacityOf, createBin } from '../../src/inventory/bins.js';
import {
  createHouse,
  holdingOf,
  houseBushels,
  movementsOn,
  receive,
  ship,
  spaceLeft,
  totalByCommodity,
  transfer,
} from '../../src/inventory/movements.js';

const cornBin = createBin({ id: 'B-1', diameterFeet: 48, eaveHeightFeet: 60, commodity: 'corn' });
const spareBin = createBin({ id: 'B-2', diameterFeet: 30, eaveHeightFeet: 40 });
const smallBin = createBin({ id: 'B-3', kind: 'hopper', diameterFeet: 15, eaveHeightFeet: 20 });

function house() {
  return createHouse([cornBin, spareBin, smallBin], { day: '2025-10-01' });
}

describe('creating the house', () => {
  it('starts every bin empty', () => {
    expect(houseBushels(house())).toBe(0);
    expect(holdingOf(house(), 'B-1').commodity).toBe('corn');
    expect(holdingOf(house(), 'B-2').commodity).toBeNull();
  });

  it('refuses the same bin twice', () => {
    expect(() => createHouse([cornBin, cornBin])).toThrow(/is in the house twice/);
  });

  it('refuses a bin nobody built', () => {
    expect(() => holdingOf(house(), 'B-9')).toThrow(/no bin B-9/);
  });
});

describe('receiving', () => {
  it('adds to the bin and leaves the old state alone', () => {
    const before = house();
    const after = receive(before, {
      bin: 'B-1',
      commodity: 'corn',
      bushels: 500_000,
      day: '2025-10-02',
      ticket: 'T-1',
    });
    expect(holdingOf(before, 'B-1').bushels).toBe(0);
    expect(formatBushels(holdingOf(after, 'B-1').bushels)).toBe('5,000.00');
    expect(after.log).toHaveLength(1);
    expect(after.log[0].ticket).toBe('T-1');
  });

  it('claims an empty unassigned bin for whatever went in it', () => {
    const after = receive(house(), {
      bin: 'B-2',
      commodity: 'soybeans',
      bushels: 100_000,
      day: '2025-10-02',
    });
    expect(holdingOf(after, 'B-2').commodity).toBe('soybeans');
  });

  it('refuses the wrong grain', () => {
    expect(() =>
      receive(house(), { bin: 'B-1', commodity: 'soybeans', bushels: 100, day: '2025-10-02' })
    ).toThrow(/is holding corn/);
  });

  it('refuses a load that will not fit', () => {
    expect(() =>
      receive(house(), {
        bin: 'B-3',
        commodity: 'corn',
        bushels: capacityOf(smallBin) + 100,
        day: '2025-10-02',
      })
    ).toThrow(/has room for/);
  });
});

describe('shipping', () => {
  const loaded = receive(house(), {
    bin: 'B-1',
    commodity: 'corn',
    bushels: 500_000,
    day: '2025-10-02',
  });

  it('draws the bin down', () => {
    const after = ship(loaded, { bin: 'B-1', bushels: 200_000, day: '2025-10-10' });
    expect(formatBushels(holdingOf(after, 'B-1').bushels)).toBe('3,000.00');
  });

  it('refuses to draw more than is there', () => {
    expect(() => ship(loaded, { bin: 'B-1', bushels: 600_000, day: '2025-10-10' })).toThrow(
      /holds 5,000.00/
    );
  });

  it('releases an unassigned bin when it empties', () => {
    const beans = receive(house(), {
      bin: 'B-2',
      commodity: 'soybeans',
      bushels: 100_000,
      day: '2025-10-02',
    });
    const drawn = ship(beans, { bin: 'B-2', bushels: 100_000, day: '2025-10-11' });
    expect(holdingOf(drawn, 'B-2').commodity).toBeNull();
  });

  it('keeps an assigned bin assigned when it empties', () => {
    const drawn = ship(loaded, { bin: 'B-1', bushels: 500_000, day: '2025-10-11' });
    expect(holdingOf(drawn, 'B-1').commodity).toBe('corn');
  });
});

describe('transferring', () => {
  const loaded = receive(house(), {
    bin: 'B-1',
    commodity: 'corn',
    bushels: 500_000,
    day: '2025-10-02',
  });

  it('moves grain between bins and logs both ends', () => {
    const after = transfer(loaded, {
      from: 'B-1',
      to: 'B-2',
      bushels: 100_000,
      day: '2025-10-12',
    });
    expect(formatBushels(holdingOf(after, 'B-1').bushels)).toBe('4,000.00');
    expect(formatBushels(holdingOf(after, 'B-2').bushels)).toBe('1,000.00');
    expect(after.log).toHaveLength(3);
  });

  it('refuses a transfer to the same bin', () => {
    expect(() =>
      transfer(loaded, { from: 'B-1', to: 'B-1', bushels: 100, day: '2025-10-12' })
    ).toThrow(/cannot transfer to itself/);
  });

  it('refuses a transfer the far bin cannot take', () => {
    expect(() =>
      transfer(loaded, { from: 'B-1', to: 'B-3', bushels: 500_000, day: '2025-10-12' })
    ).toThrow(/has room for/);
  });
});

describe('reading the house', () => {
  const loaded = receive(
    receive(house(), { bin: 'B-1', commodity: 'corn', bushels: 500_000, day: '2025-10-02' }),
    { bin: 'B-2', commodity: 'soybeans', bushels: 100_000, day: '2025-10-03' }
  );

  it('totals by commodity', () => {
    expect(totalByCommodity(loaded)).toEqual({ corn: 500_000, soybeans: 100_000 });
    expect(houseBushels(loaded)).toBe(600_000);
  });

  it('counts the space left for a commodity', () => {
    expect(spaceLeft(loaded, 'corn')).toBeGreaterThan(0);
    expect(spaceLeft(loaded, 'corn')).toBeLessThan(spaceLeft(house(), 'corn'));
  });

  it('pulls the moves for one day', () => {
    expect(movementsOn(loaded, '2025-10-02')).toHaveLength(1);
    expect(movementsOn(loaded, '2025-10-09')).toHaveLength(0);
  });
});
