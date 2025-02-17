import { describe, expect, it } from 'vitest';
import {
  FACTOR_IDS,
  formatFactor,
  getFactor,
  gradeDeterminingFactors,
  listFactors,
  meetsLimit,
  overage,
} from '../../src/grading/factors.js';

describe('the factor catalogue', () => {
  it('holds every factor the tables reference', () => {
    for (const id of ['testWeight', 'damagedTotal', 'heatDamaged', 'bcfm', 'bnfm', 'splits']) {
      expect(FACTOR_IDS).toContain(id);
    }
    expect(listFactors()).toHaveLength(FACTOR_IDS.length);
  });

  it('runs test weight the other way from everything else', () => {
    expect(getFactor('testWeight').direction).toBe('min');
    expect(getFactor('damagedTotal').direction).toBe('max');
    expect(getFactor('protein').direction).toBe('min');
  });

  it('keeps moisture and dockage out of the grade', () => {
    expect(getFactor('moisture').gradeDetermining).toBe(false);
    expect(getFactor('dockage').gradeDetermining).toBe(false);
    const determining = gradeDeterminingFactors().map((factor) => factor.id);
    expect(determining).not.toContain('moisture');
    expect(determining).toContain('testWeight');
  });

  it('refuses a factor nobody measures', () => {
    expect(() => getFactor('vomitoxin')).toThrow(/not a factor/);
  });

  it('will not let a caller edit the catalogue', () => {
    expect(Object.isFrozen(getFactor('splits'))).toBe(true);
  });
});

describe('reading against a limit', () => {
  it('passes a heavy load and fails a light one', () => {
    expect(meetsLimit('testWeight', 56.2, 56)).toBe(true);
    expect(meetsLimit('testWeight', 56, 56)).toBe(true);
    expect(meetsLimit('testWeight', 55.9, 56)).toBe(false);
  });

  it('passes a clean load and fails a damaged one', () => {
    expect(meetsLimit('damagedTotal', 3, 3)).toBe(true);
    expect(meetsLimit('damagedTotal', 3.1, 3)).toBe(false);
  });

  it('rounds the reading to the places the tables report before comparing', () => {
    expect(meetsLimit('damagedTotal', 3.04, 3)).toBe(true);
    expect(meetsLimit('damagedTotal', 3.05, 3)).toBe(false);
    expect(meetsLimit('testWeight', 55.96, 56)).toBe(true);
  });

  it('measures how far outside the limit a reading sits', () => {
    expect(overage('damagedTotal', 7.4, 5)).toBe(2.4);
    expect(overage('damagedTotal', 4.9, 5)).toBe(0);
    expect(overage('testWeight', 52.5, 54)).toBe(1.5);
    expect(overage('testWeight', 56, 54)).toBe(0);
  });

  it('prints a reading with its unit', () => {
    expect(formatFactor('testWeight', 54)).toBe('54.0 lb/bu');
    expect(formatFactor('damagedTotal', 3.25)).toBe('3.3 %');
    expect(formatFactor('fallingNumber', 312.4)).toBe('312 sec');
  });
});
