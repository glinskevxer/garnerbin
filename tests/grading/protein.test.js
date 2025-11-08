import { describe, expect, it } from 'vitest';
import {
  DON_LIMITS,
  DON_USES,
  donAcceptable,
  donLimitFor,
  isMillable,
  marketsOpenTo,
  millingReport,
  PROTEIN_BASIS_MOISTURE,
  proteinAsIs,
  proteinOnBasis,
  SOUND_FALLING_NUMBER,
  sproutCondition,
} from '../../src/grading/protein.js';

describe('the protein basis', () => {
  it('quotes on twelve percent moisture', () => {
    expect(PROTEIN_BASIS_MOISTURE).toBe(12);
  });

  it('reads a dry sample down onto the basis', () => {
    expect(proteinOnBasis(12, 10)).toBe(11.73);
  });

  it('reads a wet sample up onto the basis', () => {
    expect(proteinOnBasis(11, 14)).toBe(11.26);
  });

  it('leaves a sample already at twelve alone', () => {
    expect(proteinOnBasis(11.5, 12)).toBe(11.5);
  });

  it('goes back to as received', () => {
    expect(proteinAsIs(proteinOnBasis(12, 10), 10)).toBeCloseTo(12, 1);
  });

  it('refuses a reading nobody could have taken', () => {
    expect(() => proteinOnBasis(40, 12)).toThrow(/between 0 and 30/);
    expect(() => proteinOnBasis(12, 50)).toThrow(/between 0 and 45/);
  });
});

describe('falling number', () => {
  it('calls three hundred sound', () => {
    expect(SOUND_FALLING_NUMBER).toBe(300);
    expect(sproutCondition(340)).toBe('sound');
    expect(sproutCondition(300)).toBe('sound');
  });

  it('grades the way down', () => {
    expect(sproutCondition(299)).toBe('marginal');
    expect(sproutCondition(250)).toBe('marginal');
    expect(sproutCondition(249)).toBe('sprouted');
    expect(sproutCondition(199)).toBe('badly sprouted');
    expect(sproutCondition(0)).toBe('badly sprouted');
  });

  it('draws the milling line at two hundred and fifty', () => {
    expect(isMillable(250)).toBe(true);
    expect(isMillable(249)).toBe(false);
  });

  it('refuses a reading off the instrument', () => {
    expect(() => sproutCondition(900)).toThrow(/between 0 and 600/);
  });
});

describe('vomitoxin', () => {
  it('posts a limit for each use', () => {
    expect(DON_USES).toContain('human');
    expect(DON_LIMITS.human).toBe(1);
    expect(donLimitFor('cattle')).toBe(10);
    expect(() => donLimitFor('pets')).toThrow(/must be one of/);
  });

  it('takes a load for cattle that a mill would refuse', () => {
    expect(donAcceptable(4, 'cattle')).toBe(true);
    expect(donAcceptable(4, 'human')).toBe(false);
  });

  it('rounds the reading to a tenth before comparing', () => {
    expect(donAcceptable(1.04, 'human')).toBe(true);
    expect(donAcceptable(1.05, 'human')).toBe(false);
  });

  it('lists the markets still open', () => {
    expect(marketsOpenTo(0.5)).toEqual(DON_USES);
    expect(marketsOpenTo(4)).toEqual(['swine', 'dairy', 'cattle', 'poultry']);
    expect(marketsOpenTo(12)).toEqual([]);
  });
});

describe('the milling report', () => {
  it('puts protein on the basis using the moisture on the sample', () => {
    const report = millingReport({ protein: 12, moisture: 10 });
    expect(report.protein).toBe(11.73);
    expect(report.proteinAsIs).toBe(12);
  });

  it('assumes the basis moisture when nobody took one', () => {
    expect(millingReport({ protein: 11.5 }).protein).toBe(11.5);
  });

  it('leaves out what nobody measured', () => {
    const report = millingReport({});
    expect(report.protein).toBeNull();
    expect(report.fallingNumber).toBeNull();
    expect(report.millable).toBe(true);
  });

  it('turns a sprouted load down', () => {
    const report = millingReport({ protein: 12, moisture: 12, fallingNumber: 210 });
    expect(report.sprout).toBe('sprouted');
    expect(report.millable).toBe(false);
  });

  it('turns a load with too much vomitoxin down for milling', () => {
    const report = millingReport({ fallingNumber: 340, don: 3 });
    expect(report.millable).toBe(false);
    expect(report.markets).not.toContain('human');
  });

  it('keeps a clean load millable', () => {
    const report = millingReport({ protein: 11.8, moisture: 12, fallingNumber: 340, don: 0.4 });
    expect(report.millable).toBe(true);
    expect(report.markets).toContain('human');
  });
});
