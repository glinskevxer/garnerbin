import { describe, expect, it } from 'vitest';
import { formatBushels } from '../../src/core/money.js';
import { createSample } from '../../src/grading/sample.js';
import {
  applyShipment,
  checkAgainstSpec,
  createShippingOrder,
  isComplete,
  MODES,
  openOrder,
  orderStatus,
  remainingBushels,
} from '../../src/loadout/orders.js';

const order = createShippingOrder({
  number: 'SO-220',
  buyer: 'Cargill Blair',
  commodity: 'hrw',
  bushels: 40_000_000,
  mode: 'rail',
  destination: 'Blair NE',
  shipFrom: '2026-01-05',
  shipTo: '2026-02-27',
  pricePoints: 58_000,
  spec: { grade: 2, limits: { protein: 11.5, moisture: 13.5 } },
});

function wheat(overrides = {}) {
  return createSample({
    id: 'S-1',
    commodity: 'hrw',
    day: '2026-01-10',
    testWeight: 60.5,
    damagedTotal: 1,
    heatDamaged: 0.1,
    foreignMaterial: 0.3,
    shrunkenBroken: 2,
    defects: 2.5,
    wheatOtherClasses: 1,
    contrastingClasses: 0.5,
    protein: 12.1,
    moisture: 12.4,
    ...overrides,
  });
}

describe('creating an order', () => {
  it('takes the three modes', () => {
    expect(MODES).toEqual(['truck', 'rail', 'barge']);
    expect(() => createShippingOrder({ ...fields(), mode: 'pipeline' })).toThrow(/must be one of/);
  });

  it('keeps the spec limits it was given', () => {
    expect(order.spec.grade).toBe(2);
    expect(order.spec.limits.protein).toBe(11.5);
    expect(Object.isFrozen(order.spec)).toBe(true);
  });

  it('refuses a limit on a factor nobody measures', () => {
    expect(() => createShippingOrder({ ...fields(), spec: { limits: { colour: 3 } } })).toThrow(
      /not a factor/
    );
  });
});

function fields() {
  return {
    number: 'SO-221',
    buyer: 'Cargill Blair',
    commodity: 'hrw',
    bushels: 40_000_000,
    shipFrom: '2026-01-05',
    shipTo: '2026-02-27',
  };
}

describe('checking a load against the spec', () => {
  it('passes a load that makes everything', () => {
    const result = checkAgainstSpec(order, wheat());
    expect(result.ok).toBe(true);
    expect(result.grade).toBe(1);
  });

  it('fails a load under the grade', () => {
    const result = checkAgainstSpec(order, wheat({ damagedTotal: 8 }));
    expect(result.ok).toBe(false);
    expect(result.failures[0]).toContain('against a US No. 2 order');
  });

  it('fails a load under the protein even when the grade is fine', () => {
    const result = checkAgainstSpec(order, wheat({ protein: 10.8 }));
    expect(result.grade).toBe(1);
    expect(result.failures).toContain(
      'protein, twelve percent basis is 10.8 against a limit of 11.5'
    );
  });

  it('fails a wet load on the moisture ceiling', () => {
    const result = checkAgainstSpec(order, wheat({ moisture: 14 }));
    expect(result.failures[0]).toContain('moisture is 14 against a limit of 13.5');
  });

  it('reports every failure and not just the first', () => {
    const result = checkAgainstSpec(order, wheat({ protein: 10.8, moisture: 14 }));
    expect(result.failures).toHaveLength(2);
  });

  it('turns down a special grade', () => {
    const result = checkAgainstSpec(order, wheat({ ergotPercent: 0.2 }));
    expect(result.failures).toContain('carries ergoty');
  });

  it('takes a special grade when the buyer said he would', () => {
    const relaxed = createShippingOrder({
      ...fields(),
      spec: { grade: 2, rejectSpecialGrades: false },
    });
    expect(checkAgainstSpec(relaxed, wheat({ ergotPercent: 0.2 })).ok).toBe(true);
  });

  it('says so when nobody measured a spec factor', () => {
    const noProtein = wheat();
    const stripped = { ...noProtein };
    delete stripped.protein;
    expect(checkAgainstSpec(order, stripped).failures).toContain(
      'nobody measured protein, twelve percent basis'
    );
  });
});

describe('shipping against an order', () => {
  it('adds cars up', () => {
    let position = openOrder(order);
    position = applyShipment(position, {
      ticket: 'T-1',
      bushels: 400_000,
      day: '2026-01-10',
      car: 'NS 8801',
    });
    position = applyShipment(position, { ticket: 'T-2', bushels: 400_000, day: '2026-01-10' });
    expect(formatBushels(position.shippedBushels)).toBe('8,000.00');
    expect(position.shipments[0].car).toBe('NS 8801');
  });

  it('refuses to ship more than the order calls for', () => {
    const position = openOrder(order);
    expect(() =>
      applyShipment(position, { ticket: 'T-1', bushels: 50_000_000, day: '2026-01-10' })
    ).toThrow(/is for 400,000.00/);
  });

  it('reports where the order stands', () => {
    const position = applyShipment(openOrder(order), {
      ticket: 'T-1',
      bushels: 40_000_000,
      day: '2026-01-10',
    });
    expect(remainingBushels(position)).toBe(0);
    expect(isComplete(position)).toBe(true);
    expect(orderStatus(position).cars).toBe(1);
  });
});
