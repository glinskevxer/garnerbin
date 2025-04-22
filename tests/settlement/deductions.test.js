import { describe, expect, it } from 'vitest';
import { formatMoney } from '../../src/core/money.js';
import {
  applyAssessments,
  assessmentAmount,
  checkoffFor,
  createAssessment,
  KINDS,
  perBushelCharge,
  serviceCharge,
} from '../../src/settlement/deductions.js';

const load = { bushelHundredths: 90_000, grossCents: 385_000 };

describe('creating an assessment', () => {
  it('takes the three kinds and no others', () => {
    expect(KINDS).toEqual(['perBushel', 'percentOfValue', 'flat']);
    expect(() => createAssessment({ id: 'x', label: 'x', kind: 'per acre' })).toThrow(
      /must be one of/
    );
  });

  it('keeps only the field its kind needs', () => {
    const perBushel = perBushelCharge('elev', 'Elevation', 300);
    expect(perBushel.points).toBe(300);
    expect(perBushel.rate).toBeUndefined();
    expect(Object.isFrozen(perBushel)).toBe(true);
  });

  it('refuses a rate that is missing', () => {
    expect(() => createAssessment({ id: 'x', label: 'x', kind: 'percentOfValue' })).toThrow(
      /rate is required/
    );
  });
});

describe('working an assessment out', () => {
  it('charges a per bushel rate on the bushels', () => {
    expect(assessmentAmount(perBushelCharge('c', 'Checkoff', 100), load)).toBe(900);
  });

  it('charges a percent of value on the value', () => {
    const half = createAssessment({
      id: 'sb',
      label: 'Soybean checkoff',
      kind: 'percentOfValue',
      rate: 0.005,
    });
    expect(assessmentAmount(half, load)).toBe(1925);
  });

  it('charges a flat fee whatever the load is', () => {
    const fee = serviceCharge('after-hours', 'After hours unload', 2500);
    expect(assessmentAmount(fee, load)).toBe(2500);
    expect(assessmentAmount(fee, { bushelHundredths: 1, grossCents: 1 })).toBe(2500);
  });
});

describe('the commodity checkoff', () => {
  it('charges corn a flat cent a bushel', () => {
    const corn = checkoffFor('corn');
    expect(corn.kind).toBe('perBushel');
    expect(corn.points).toBe(100);
    expect(formatMoney(assessmentAmount(corn, load))).toBe('9.00');
  });

  it('charges soybeans a half percent of the value', () => {
    const beans = checkoffFor('soybeans');
    expect(beans.kind).toBe('percentOfValue');
    expect(beans.rate).toBe(0.005);
    expect(formatMoney(assessmentAmount(beans, load))).toBe('19.25');
  });

  it('moves the bean checkoff with the market but not the corn one', () => {
    const rich = { bushelHundredths: 90_000, grossCents: 500_000 };
    expect(assessmentAmount(checkoffFor('corn'), rich)).toBe(
      assessmentAmount(checkoffFor('corn'), load)
    );
    expect(assessmentAmount(checkoffFor('soybeans'), rich)).toBeGreaterThan(
      assessmentAmount(checkoffFor('soybeans'), load)
    );
  });

  it('marks the per bushel checkoffs refundable', () => {
    expect(checkoffFor('corn').refundable).toBe(true);
    expect(checkoffFor('soybeans').refundable).toBe(false);
  });
});

describe('applying a list', () => {
  it('lines them up and totals them', () => {
    const result = applyAssessments(
      [checkoffFor('corn'), serviceCharge('after-hours', 'After hours unload', 2500)],
      load
    );
    expect(result.lines).toHaveLength(2);
    expect(formatMoney(result.totalCents)).toBe('34.00');
    expect(formatMoney(result.refundableCents)).toBe('9.00');
  });

  it('totals nothing when nothing applies', () => {
    expect(applyAssessments([], load).totalCents).toBe(0);
  });
});
