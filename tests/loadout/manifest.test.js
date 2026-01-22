import { describe, expect, it } from 'vitest';
import { formatBushels } from '../../src/core/money.js';
import { createSample } from '../../src/grading/sample.js';
import { createShippingOrder } from '../../src/loadout/orders.js';
import {
  buildManifest,
  manifestCsv,
  renderManifest,
  worstCar,
} from '../../src/loadout/manifest.js';

const order = createShippingOrder({
  number: 'SO-220',
  buyer: 'Archer Blair',
  commodity: 'corn',
  bushels: 40_000_000,
  destination: 'Blair NE',
  shipFrom: '2026-01-05',
  shipTo: '2026-02-27',
  spec: { grade: 2, limits: { moisture: 15.5 } },
});

function corn(overrides = {}) {
  return createSample({
    id: 'S',
    commodity: 'corn',
    day: '2026-01-20',
    testWeight: 56,
    damagedTotal: 2,
    heatDamaged: 0,
    bcfm: 2,
    moisture: 14.8,
    ...overrides,
  });
}

function car(name, sample, bushels = 380_000) {
  return { car: name, ticket: `T-${name}`, seal: `SL-${name}`, bushels, sample };
}

const cars = [
  car('BNSF476211', corn()),
  car('BNSF476212', corn({ damagedTotal: 3.5 })),
  car('BNSF476213', corn({ damagedTotal: 4.5, moisture: 15.2 })),
];

describe('building a manifest', () => {
  const manifest = buildManifest({
    order,
    cars,
    day: '2026-01-20',
    house: 'Rush Creek Grain',
    number: 'MAN-14',
  });

  it('adds the cars up', () => {
    expect(manifest.cars).toHaveLength(3);
    expect(formatBushels(manifest.bushels)).toBe('11,400.00');
  });

  it('composites the cars weighted by their bushels', () => {
    expect(manifest.composite.damagedTotal).toBeCloseTo(3.3, 1);
    expect(manifest.grade.grade).toBe(2);
  });

  it('checks the composite against the order', () => {
    expect(manifest.check.ok).toBe(true);
    expect(manifest.releasable).toBe(true);
  });

  it('holds a train that misses the spec', () => {
    const wet = buildManifest({
      order,
      cars: [...cars, car('BNSF476214', corn({ moisture: 19 }), 3_800_000)],
      day: '2026-01-20',
    });
    expect(wet.releasable).toBe(false);
    expect(wet.check.failures[0]).toContain('moisture');
  });

  it('holds a train that misses the grade', () => {
    const damaged = buildManifest({
      order,
      cars: [...cars, car('BNSF476215', corn({ damagedTotal: 12 }), 3_800_000)],
      day: '2026-01-20',
    });
    expect(damaged.releasable).toBe(false);
  });

  it('refuses a car of the wrong grain', () => {
    const beans = createSample({
      id: 'S-B',
      commodity: 'soybeans',
      day: '2026-01-20',
      testWeight: 56,
      damagedTotal: 1,
      heatDamaged: 0,
      foreignMaterial: 1,
      splits: 5,
      otherColors: 0.2,
    });
    expect(() =>
      buildManifest({ order, cars: [...cars, car('X', beans)], day: '2026-01-20' })
    ).toThrow(/is not corn/);
  });

  it('refuses a manifest with no cars', () => {
    expect(() => buildManifest({ order, cars: [], day: '2026-01-20' })).toThrow(/at least 1/);
  });

  it('numbers itself off the order when nobody gave a number', () => {
    expect(buildManifest({ order, cars, day: '2026-01-20' }).number).toBe('MAN-SO-220');
  });
});

describe('reading a manifest', () => {
  const manifest = buildManifest({
    order,
    cars,
    day: '2026-01-20',
    house: 'Rush Creek Grain',
    number: 'MAN-14',
  });

  it('prints the header and the cars', () => {
    const text = renderManifest(manifest);
    expect(text).toContain('Rush Creek Grain manifest MAN-14');
    expect(text).toContain('BNSF476211');
    expect(text).toContain('Meets the order. Release it.');
  });

  it('says what to hold it for when it misses', () => {
    const wet = buildManifest({
      order,
      cars: [...cars, car('BNSF476214', corn({ moisture: 19 }), 3_800_000)],
      day: '2026-01-20',
    });
    expect(renderManifest(wet)).toContain('Hold this train:');
  });

  it('writes a csv with a row for each car', () => {
    const csv = manifestCsv(manifest);
    expect(csv.split('\n')[0]).toBe('manifest,day,order,car,ticket,seal,bushels');
    expect(csv.split('\n')).toHaveLength(5);
  });

  it('names the car pulling the composite down', () => {
    expect(worstCar(manifest, 'damagedTotal').car).toBe('BNSF476213');
    expect(worstCar(manifest, 'splits')).toBeNull();
  });
});
