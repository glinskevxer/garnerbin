import { describe, expect, it } from 'vitest';
import { COMMODITY_IDS } from '../../src/commodity/registry.js';
import { getFactor } from '../../src/grading/factors.js';
import {
  factorsFor,
  gradesFor,
  limitOf,
  limitsFor,
  lowestNumericGrade,
  SAMPLE_GRADE,
  tableFor,
} from '../../src/grading/standards.js';

describe('the tables', () => {
  it('covers every commodity the house takes', () => {
    for (const id of COMMODITY_IDS) {
      expect(tableFor(id).commodity).toBe(id);
      expect(gradesFor(id).length).toBeGreaterThan(0);
    }
  });

  it('runs corn and wheat to five grades and the rest to four', () => {
    expect(gradesFor('corn')).toEqual([1, 2, 3, 4, 5]);
    expect(gradesFor('hrw')).toEqual([1, 2, 3, 4, 5]);
    expect(gradesFor('soybeans')).toEqual([1, 2, 3, 4]);
    expect(gradesFor('sorghum')).toEqual([1, 2, 3, 4]);
    expect(lowestNumericGrade('corn')).toBe(5);
    expect(lowestNumericGrade('soybeans')).toBe(4);
  });

  it('names sample grade the same everywhere', () => {
    expect(SAMPLE_GRADE).toBe('sample');
  });

  it('holds the corn limits from the standard', () => {
    expect(limitsFor('corn', 2)).toEqual({
      testWeight: 54,
      damagedTotal: 5,
      heatDamaged: 0.2,
      bcfm: 3,
    });
    expect(limitOf('corn', 1, 'testWeight')).toBe(56);
    expect(limitOf('corn', 5, 'bcfm')).toBe(7);
  });

  it('holds the soybean splits ladder', () => {
    expect([1, 2, 3, 4].map((grade) => limitOf('soybeans', grade, 'splits'))).toEqual([
      10, 20, 30, 40,
    ]);
  });

  it('puts both wheats in the same test weight column', () => {
    for (const grade of [1, 2, 3, 4, 5]) {
      expect(limitOf('hrw', grade, 'testWeight')).toBe(limitOf('srw', grade, 'testWeight'));
    }
    expect(limitOf('hrw', 1, 'testWeight')).toBe(60);
    expect(limitOf('hrw', 5, 'testWeight')).toBe(51);
  });

  it('holds the sorghum broken kernel ladder', () => {
    expect([1, 2, 3, 4].map((grade) => limitOf('sorghum', grade, 'bnfm'))).toEqual([4, 8, 12, 15]);
  });
});

describe('table shape', () => {
  it('constrains the same factors at every grade', () => {
    for (const id of COMMODITY_IDS) {
      const expected = factorsFor(id);
      for (const grade of gradesFor(id)) {
        expect(Object.keys(limitsFor(id, grade)).sort()).toEqual([...expected].sort());
      }
    }
  });

  it('only names factors the catalogue knows', () => {
    for (const id of COMMODITY_IDS) {
      for (const factorId of factorsFor(id)) {
        expect(getFactor(factorId).gradeDetermining).toBe(true);
      }
    }
  });

  it('loosens every limit as the grade drops', () => {
    for (const id of COMMODITY_IDS) {
      const grades = gradesFor(id);
      for (const factorId of factorsFor(id)) {
        const direction = getFactor(factorId).direction;
        for (let index = 1; index < grades.length; index += 1) {
          const better = limitOf(id, grades[index - 1], factorId);
          const worse = limitOf(id, grades[index], factorId);
          if (direction === 'min') expect(worse).toBeLessThanOrEqual(better);
          else expect(worse).toBeGreaterThanOrEqual(better);
        }
      }
    }
  });

  it('refuses a grade the commodity does not have', () => {
    expect(() => limitsFor('soybeans', 5)).toThrow(/has no US No. 5/);
    expect(() => limitOf('corn', 1, 'splits')).toThrow(/not in the corn table/);
  });

  it('will not let a caller edit a limit row', () => {
    expect(Object.isFrozen(limitsFor('corn', 2))).toBe(true);
  });
});
