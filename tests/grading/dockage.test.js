import { describe, expect, it } from 'vitest';
import { formatBushels } from '../../src/core/money.js';
import {
  applyDockage,
  cleanPercent,
  computeDockage,
  dockagePounds,
  isReportable,
  onCleanBasis,
  reportedDockage,
  REPORTABLE_THRESHOLD,
} from '../../src/grading/dockage.js';

describe('computeDockage', () => {
  it('adds every pan the tester throws off', () => {
    const result = computeDockage({
      sampleGrams: 1000,
      siftingsGrams: 8.4,
      largeGrams: 2.1,
      aspiratedGrams: 1.5,
    });
    expect(result.grams).toBe(12);
    expect(result.percent).toBe(1.2);
    expect(result.cleanGrams).toBe(988);
  });

  it('counts a handpicked pan too', () => {
    const result = computeDockage({ sampleGrams: 1000, siftingsGrams: 5, handpickedGrams: 3 });
    expect(result.percent).toBe(0.8);
  });

  it('treats a missing pan as empty', () => {
    expect(computeDockage({ sampleGrams: 500 }).percent).toBe(0);
  });

  it('refuses more dockage than sample', () => {
    expect(() => computeDockage({ sampleGrams: 100, siftingsGrams: 120 })).toThrow(
      /120 g of dockage in a 100 g sample/
    );
  });

  it('refuses an empty sample', () => {
    expect(() => computeDockage({ sampleGrams: 0 })).toThrow(/greater than zero/);
  });
});

describe('reporting dockage', () => {
  it('rounds to the tenth', () => {
    expect(reportedDockage(1.24)).toBe(1.2);
    expect(reportedDockage(1.25)).toBe(1.3);
  });

  it('reads anything under the threshold as none', () => {
    expect(REPORTABLE_THRESHOLD).toBe(0.05);
    expect(reportedDockage(0.049)).toBe(0);
    expect(reportedDockage(0.05)).toBe(0.1);
    expect(isReportable(0.02)).toBe(false);
    expect(isReportable(0.6)).toBe(true);
  });

  it('gives the clean share', () => {
    expect(cleanPercent(1.4)).toBe(98.6);
    expect(cleanPercent(0)).toBe(100);
  });
});

describe('taking dockage off a load', () => {
  it('splits the bushels and keeps the screenings', () => {
    const split = applyDockage(100_000, 1.5);
    expect(formatBushels(split.grossBushels)).toBe('1,000.00');
    expect(formatBushels(split.dockageBushels)).toBe('15.00');
    expect(formatBushels(split.netBushels)).toBe('985.00');
    expect(split.dockagePercent).toBe(1.5);
  });

  it('truncates the screenings rather than rounding them up', () => {
    const split = applyDockage(123_456, 0.7);
    expect(formatBushels(split.dockageBushels)).toBe('8.64');
    expect(split.netBushels + split.dockageBushels).toBe(123_456);
  });

  it('leaves the load whole when there is nothing to take', () => {
    const split = applyDockage(100_000, 0.03);
    expect(split.dockageBushels).toBe(0);
    expect(split.netBushels).toBe(100_000);
  });

  it('cuts the pounds the same way', () => {
    expect(dockagePounds(60_000, 1.5)).toBe(900);
    expect(dockagePounds(60_000, 0)).toBe(0);
  });
});

describe('lifting a reading onto the clean basis', () => {
  it('divides by the clean share', () => {
    expect(onCleanBasis(2, 2)).toBe(2.04);
    expect(onCleanBasis(0, 5)).toBe(0);
  });

  it('leaves a reading alone when there is no dockage', () => {
    expect(onCleanBasis(3.5, 0)).toBe(3.5);
  });

  it('refuses a sample that is all dockage', () => {
    expect(() => onCleanBasis(1, 100)).toThrow(/all dockage/);
  });
});
