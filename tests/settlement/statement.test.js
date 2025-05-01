import { describe, expect, it } from 'vitest';
import { createTicket } from '../../src/weights/ticket.js';
import { createSample } from '../../src/grading/sample.js';
import { createDryingSchedule } from '../../src/weights/drying.js';
import { createDiscountSchedule } from '../../src/pricing/discounts.js';
import { checkoffFor } from '../../src/settlement/deductions.js';
import { settleLoad } from '../../src/settlement/settle.js';
import { buildStatement, renderStatement, statementFor } from '../../src/settlement/statement.js';

const ticket = createTicket({
  number: 'T-10441',
  day: '2025-10-09',
  commodity: 'corn',
  account: 'HALVORSEN',
  grossPounds: 78_500,
  tarePounds: 28_100,
});

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

const dry = createSample({
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

const settlement = settleLoad({
  ticket,
  sample: wet,
  bidPoints: 42_750,
  discountSchedule,
  dryingSchedule: createDryingSchedule({ ratePoints: 450, rounding: 'tenth' }),
  assessments: [checkoffFor('corn')],
});

describe('buildStatement', () => {
  it('numbers itself off the ticket', () => {
    const statement = buildStatement(settlement);
    expect(statement.number).toBe('ST-T-10441');
    expect(statement.account).toBe('HALVORSEN');
    expect(statement.commodity.name).toBe('Yellow corn');
    expect(statement.grade).toBe('US No. 4');
  });

  it('shows the deductions in the bushel column', () => {
    const statement = buildStatement(settlement);
    expect(statement.weightRows.map((row) => row.label)).toEqual([
      'Gross bushels',
      'Clean bushels',
      'Shrink at 4.90 percent',
      'Settlement bushels',
    ]);
  });

  it('shows the discount as a rate off the bid', () => {
    const statement = buildStatement(settlement);
    expect(statement.priceRows[0]).toEqual({
      label: 'Posted bid',
      rate: '4.2750',
      amount: '',
    });
    expect(statement.priceRows[1].label).toBe('Damaged kernels, total at 7.4');
    expect(statement.priceRows[1].rate).toBe('-0.0300');
  });

  it('shows drying and the checkoff as money', () => {
    const statement = buildStatement(settlement);
    expect(statement.chargeRows[0].amount).toBe('-134.80');
    expect(statement.chargeRows[1].label).toBe('Yellow corn checkoff (refundable)');
  });

  it('leaves the charge table off a load that owed nothing', () => {
    const clean = settleLoad({ ticket, sample: dry, bidPoints: 42_750 });
    expect(buildStatement(clean).chargeRows).toEqual([]);
  });
});

describe('renderStatement', () => {
  const text = statementFor(settlement, { house: 'Rush Creek Grain', number: 'ST-4471' });

  it('heads the sheet with the house and the number', () => {
    expect(text).toContain('Rush Creek Grain settlement ST-4471');
    expect(text).toContain('Account  HALVORSEN');
  });

  it('prints the bushel column and the money column separately', () => {
    expect(text).toMatch(/Settlement bushels +855\.90/);
    expect(text).toContain('Net due 3,489.94');
  });

  it('renders from a built statement too', () => {
    expect(renderStatement(buildStatement(settlement))).toContain('Net due');
  });

  it('drops the charge table on a clean load', () => {
    const clean = settleLoad({ ticket, sample: dry, bidPoints: 42_750 });
    expect(statementFor(clean)).not.toContain('charges');
  });
});
