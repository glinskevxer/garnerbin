import { describe, expect, it } from 'vitest';
import { formatBushels, formatMoney, formatPrice } from '../../src/core/money.js';
import { createTicket } from '../../src/weights/ticket.js';
import { createSample } from '../../src/grading/sample.js';
import { createDryingSchedule } from '../../src/weights/drying.js';
import { createDiscountSchedule } from '../../src/pricing/discounts.js';
import { createPremiumSchedule } from '../../src/pricing/premiums.js';
import { checkoffFor, serviceCharge } from '../../src/settlement/deductions.js';
import { realisedPrice, settleLoad, settleRun } from '../../src/settlement/settle.js';

const ticket = createTicket({
  number: 'T-10441',
  day: '2025-10-09',
  commodity: 'corn',
  account: 'HALVORSEN',
  grossPounds: 78_500,
  tarePounds: 28_100,
});

const sample = createSample({
  id: 'S-1',
  commodity: 'corn',
  day: '2025-10-09',
  testWeight: 55.4,
  damagedTotal: 2.1,
  heatDamaged: 0,
  bcfm: 1.8,
  moisture: 15,
});

const discountSchedule = createDiscountSchedule({
  id: 'rush-creek',
  commodity: 'corn',
  factors: {
    damagedTotal: {
      bands: [
        { from: 0, to: 5, points: 0 },
        { from: 5, to: null, pointsPerUnit: 100, step: 1 },
      ],
    },
  },
});

const dryingSchedule = createDryingSchedule({ ratePoints: 450, rounding: 'tenth' });

describe('settling a clean dry load', () => {
  const result = settleLoad({ ticket, sample, bidPoints: 42_750 });

  it('takes no shrink and no discount', () => {
    expect(formatBushels(result.weights.netBushels)).toBe('900.00');
    expect(result.discountPoints).toBe(0);
    expect(result.drying.cents).toBe(0);
  });

  it('values it at the bid', () => {
    expect(formatMoney(result.valueCents)).toBe('3,847.50');
    expect(result.netCents).toBe(result.valueCents);
  });

  it('carries the grade through', () => {
    expect(result.grade.grade).toBe(2);
    expect(result.commodity).toBe('corn');
    expect(result.ticket).toBe('T-10441');
  });
});

describe('settling a wet damaged load', () => {
  const wet = createSample({
    id: 'S-2',
    commodity: 'corn',
    day: '2025-10-09',
    testWeight: 53.2,
    damagedTotal: 7.4,
    heatDamaged: 0.1,
    bcfm: 2.5,
    moisture: 18.5,
  });
  const result = settleLoad({
    ticket,
    sample: wet,
    bidPoints: 42_750,
    discountSchedule,
    dryingSchedule,
    assessments: [checkoffFor('corn')],
  });

  it('shrinks the bushels first', () => {
    expect(result.weights.moistureShrinkPercent).toBe(4.9);
    expect(formatBushels(result.weights.netBushels)).toBe('855.90');
  });

  it('discounts the price rather than the value', () => {
    expect(result.discountPoints).toBe(300);
    expect(formatPrice(result.netPricePoints)).toBe('4.2450');
  });

  it('charges drying on the settlement bushels', () => {
    expect(result.drying.points).toBe(3.5);
    expect(formatMoney(result.drying.cents)).toBe('134.80');
  });

  it('takes the checkoff off the value', () => {
    expect(formatMoney(result.assessments.totalCents)).toBe('8.56');
  });

  it('lands on a net the grower can check', () => {
    expect(formatMoney(result.valueCents)).toBe('3,633.30');
    expect(formatMoney(result.netCents)).toBe('3,489.94');
  });

  it('grades it on the worst factor', () => {
    expect(result.grade.grade).toBe(4);
  });
});

describe('a load that earns a premium', () => {
  const wheatTicket = createTicket({
    number: 'T-20001',
    day: '2026-01-15',
    commodity: 'hrw',
    account: 'VOSS-LAND-CO',
    grossPounds: 78_100,
    tarePounds: 28_100,
  });

  const wheat = createSample({
    id: 'S-W1',
    commodity: 'hrw',
    day: '2026-01-15',
    testWeight: 60.5,
    damagedTotal: 1,
    heatDamaged: 0.1,
    foreignMaterial: 0.3,
    shrunkenBroken: 2,
    defects: 2.5,
    wheatOtherClasses: 1,
    contrastingClasses: 0.5,
    protein: 12,
    moisture: 12.4,
  });

  const premiumSchedule = createPremiumSchedule({
    id: 'blair',
    commodity: 'hrw',
    scales: { protein: { base: 11, step: 0.25, abovePoints: 300, belowPoints: 400 } },
  });

  it('adds the premium to the price', () => {
    const result = settleLoad({
      ticket: wheatTicket,
      sample: wheat,
      bidPoints: 58_000,
      premiumSchedule,
    });
    expect(result.premiumPoints).toBe(1200);
    expect(result.netPricePoints).toBe(59_200);
    expect(result.premiumLines[0].factor).toBe('protein');
  });

  it('takes a discount off the same price', () => {
    const thin = createSample({ ...readingsFor(wheat), id: 'S-W2', protein: 10.5 });
    const result = settleLoad({
      ticket: wheatTicket,
      sample: thin,
      bidPoints: 58_000,
      premiumSchedule,
    });
    expect(result.premiumPoints).toBe(-800);
    expect(result.netPricePoints).toBe(57_200);
  });

  it('pays the bid when the house posts no premium schedule', () => {
    const result = settleLoad({ ticket: wheatTicket, sample: wheat, bidPoints: 58_000 });
    expect(result.premiumPoints).toBe(0);
    expect(result.premiumLines).toEqual([]);
    expect(result.netPricePoints).toBe(58_000);
  });
});

function readingsFor(sample) {
  const copy = { ...sample };
  delete copy.grams;
  delete copy.grader;
  return copy;
}

describe('extras', () => {
  it('adds a service charge on top', () => {
    const result = settleLoad({
      ticket,
      sample,
      bidPoints: 42_750,
      assessments: [serviceCharge('after-hours', 'After hours unload', 2500)],
    });
    expect(result.netCents).toBe(result.valueCents - 2500);
  });

  it('reports the price the grower actually got', () => {
    const result = settleLoad({ ticket, sample, bidPoints: 42_750 });
    expect(formatPrice(realisedPrice(result))).toBe('4.2750');
  });

  it('reports nothing per bushel on an empty settlement', () => {
    const empty = settleLoad({
      ticket: createTicket({ ...ticketFields(), direction: 'out', grossPounds: 28_100 }),
      sample,
      bidPoints: 42_750,
    });
    expect(realisedPrice(empty)).toBe(0);
  });

  it('refuses a bid that is not a whole number of points', () => {
    expect(() => settleLoad({ ticket, sample, bidPoints: 4.275 })).toThrow(/whole number/);
  });
});

function ticketFields() {
  return {
    number: 'T-10442',
    day: '2025-10-09',
    commodity: 'corn',
    account: 'HALVORSEN',
    grossPounds: 78_500,
    tarePounds: 28_100,
  };
}

describe('settling a run', () => {
  it('adds the loads up', () => {
    const run = settleRun(
      [
        { ticket, sample },
        { ticket: createTicket(ticketFields()), sample },
      ],
      { bidPoints: 42_750 }
    );
    expect(run.settlements).toHaveLength(2);
    expect(formatBushels(run.netBushels)).toBe('1,800.00');
    expect(formatMoney(run.netCents)).toBe('7,695.00');
  });

  it('refuses an empty run', () => {
    expect(() => settleRun([], { bidPoints: 42_750 })).toThrow(/at least 1/);
  });
});
