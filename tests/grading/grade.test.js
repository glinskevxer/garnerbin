import { describe, expect, it } from 'vitest';
import {
  compareGrades,
  determineGrade,
  factorGrade,
  gradeLabel,
  isWorse,
  meetsContractGrade,
  shortOf,
  wouldMake,
} from '../../src/grading/grade.js';
import { SAMPLE_GRADE } from '../../src/grading/standards.js';

const cleanCorn = { testWeight: 57.5, damagedTotal: 1.2, heatDamaged: 0, bcfm: 1.1 };

describe('factorGrade', () => {
  it('finds the best grade one reading allows', () => {
    expect(factorGrade('corn', 'testWeight', 56.5)).toBe(1);
    expect(factorGrade('corn', 'testWeight', 54.5)).toBe(2);
    expect(factorGrade('corn', 'testWeight', 45)).toBe(SAMPLE_GRADE);
    expect(factorGrade('corn', 'bcfm', 3.4)).toBe(3);
  });

  it('puts a reading exactly on the limit in the better grade', () => {
    expect(factorGrade('corn', 'damagedTotal', 3)).toBe(1);
    expect(factorGrade('corn', 'damagedTotal', 3.1)).toBe(2);
  });
});

describe('determineGrade', () => {
  it('grades a clean load number one', () => {
    const result = determineGrade('corn', cleanCorn);
    expect(result.grade).toBe(1);
    expect(result.label).toBe('US No. 1');
  });

  it('lets one bad factor pull the whole load down', () => {
    const result = determineGrade('corn', { ...cleanCorn, heatDamaged: 0.6 });
    expect(result.grade).toBe(4);
    expect(result.limitingFactors.map((entry) => entry.factor)).toEqual(['heatDamaged']);
    expect(result.limitingFactors[0].limit).toBe(1);
  });

  it('names every factor sitting at the grade', () => {
    const result = determineGrade('corn', {
      testWeight: 52.4,
      damagedTotal: 6.9,
      heatDamaged: 0,
      bcfm: 1,
    });
    expect(result.grade).toBe(3);
    expect(result.limitingFactors.map((entry) => entry.factor).sort()).toEqual([
      'damagedTotal',
      'testWeight',
    ]);
  });

  it('drops to sample grade when nothing catches it', () => {
    const result = determineGrade('corn', {
      testWeight: 44,
      damagedTotal: 2,
      heatDamaged: 0,
      bcfm: 1,
    });
    expect(result.grade).toBe(SAMPLE_GRADE);
    expect(result.label).toBe('US Sample grade');
    expect(result.limitingFactors[0].limit).toBeNull();
  });

  it('grades soybeans on splits when nothing else bites', () => {
    const result = determineGrade('soybeans', {
      testWeight: 57,
      damagedTotal: 1,
      heatDamaged: 0,
      foreignMaterial: 0.5,
      splits: 24,
      otherColors: 0.5,
    });
    expect(result.grade).toBe(3);
    expect(result.byFactor.splits).toBe(3);
    expect(result.byFactor.testWeight).toBe(1);
  });

  it('grades wheat on the defects column', () => {
    const result = determineGrade('hrw', {
      testWeight: 61,
      damagedTotal: 1,
      heatDamaged: 0.1,
      foreignMaterial: 0.3,
      shrunkenBroken: 6.5,
      defects: 7.5,
      wheatOtherClasses: 1,
      contrastingClasses: 0.5,
    });
    expect(result.grade).toBe(3);
  });

  it('refuses a sample with a factor missing', () => {
    expect(() => determineGrade('corn', { testWeight: 56, damagedTotal: 1 })).toThrow(
      /needs heatDamaged, bcfm/
    );
  });

  it('refuses readings that are not an object', () => {
    expect(() => determineGrade('corn', [])).toThrow(/must be an object/);
  });
});

describe('comparing grades', () => {
  it('knows which way is worse', () => {
    expect(isWorse(3, 2)).toBe(true);
    expect(isWorse(2, 3)).toBe(false);
    expect(isWorse(SAMPLE_GRADE, 5)).toBe(true);
    expect(isWorse(5, SAMPLE_GRADE)).toBe(false);
    expect(isWorse(2, 2)).toBe(false);
  });

  it('sorts a list of grades', () => {
    expect([3, SAMPLE_GRADE, 1, 2].sort(compareGrades)).toEqual([1, 2, 3, SAMPLE_GRADE]);
  });

  it('accepts a load at or above the contract grade', () => {
    expect(meetsContractGrade(1, 2)).toBe(true);
    expect(meetsContractGrade(2, 2)).toBe(true);
    expect(meetsContractGrade(3, 2)).toBe(false);
    expect(meetsContractGrade(SAMPLE_GRADE, 5)).toBe(false);
  });

  it('labels a grade', () => {
    expect(gradeLabel(2)).toBe('US No. 2');
    expect(gradeLabel(SAMPLE_GRADE)).toBe('US Sample grade');
  });
});

describe('what is holding the load back', () => {
  const wet = { testWeight: 53.2, damagedTotal: 6.4, heatDamaged: 0, bcfm: 2.5 };

  it('lists the gaps against a target grade', () => {
    const gaps = shortOf('corn', wet, 2);
    expect(gaps.map((gap) => gap.factor).sort()).toEqual(['damagedTotal', 'testWeight']);
    expect(gaps.find((gap) => gap.factor === 'testWeight').gap).toBe(0.8);
    expect(gaps.find((gap) => gap.factor === 'damagedTotal').gap).toBe(1.4);
  });

  it('reports nothing when the load already makes the grade', () => {
    expect(shortOf('corn', cleanCorn, 2)).toEqual([]);
  });

  it('answers whether cleaning one factor would do it', () => {
    expect(wouldMake('corn', wet, 2)).toBe(false);
    expect(wouldMake('corn', wet, 2, ['testWeight'])).toBe(false);
    expect(wouldMake('corn', wet, 2, ['testWeight', 'damagedTotal'])).toBe(true);
    expect(wouldMake('corn', cleanCorn, 1)).toBe(true);
  });
});
