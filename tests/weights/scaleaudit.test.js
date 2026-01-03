import { describe, expect, it } from 'vitest';
import {
  acceptanceDivisions,
  createScaleTest,
  DEFAULT_TEST_INTERVAL_DAYS,
  daysSince,
  driftAt,
  history,
  isOverdue,
  MAINTENANCE_MULTIPLIER,
  nextTestDue,
  renderTest,
  toleranceLb,
  worstPoint,
} from '../../src/weights/scaleaudit.js';

function test(overrides = {}) {
  return createScaleTest({
    scale: 'pit scale',
    day: '2025-08-14',
    inspector: 'state weights and measures',
    divisionLb: 20,
    points: [
      { testLoadLb: 10_000, indicatedLb: 10_000 },
      { testLoadLb: 30_000, indicatedLb: 30_010 },
      { testLoadLb: 50_000, indicatedLb: 50_020 },
    ],
    ...overrides,
  });
}

describe('tolerances', () => {
  it('widens with the test load in divisions', () => {
    expect(acceptanceDivisions(500)).toBe(0.5);
    expect(acceptanceDivisions(5000)).toBe(0.5);
    expect(acceptanceDivisions(5001)).toBe(1);
    expect(acceptanceDivisions(10_001)).toBe(1.5);
  });

  it('doubles for a scale in service', () => {
    expect(MAINTENANCE_MULTIPLIER).toBe(2);
    expect(toleranceLb(50_000, 20, { inService: false })).toBe(10);
    expect(toleranceLb(50_000, 20)).toBe(20);
    expect(toleranceLb(150_000, 20, { inService: false })).toBe(20);
  });

  it('refuses a division of nothing', () => {
    expect(() => toleranceLb(50_000, 0)).toThrow(/greater than zero/);
  });
});

describe('a scale test', () => {
  it('works the error out at each point', () => {
    const result = test();
    expect(result.points[0].errorLb).toBe(0);
    expect(result.points[2].errorLb).toBe(20);
    expect(result.passed).toBe(true);
  });

  it('fails a point outside the tolerance', () => {
    const failed = test({
      points: [{ testLoadLb: 50_000, indicatedLb: 50_100 }],
    });
    expect(failed.passed).toBe(false);
    expect(failed.points[0].passed).toBe(false);
  });

  it('holds a scale out of service to the tighter tolerance', () => {
    const strict = test({ inService: false });
    expect(strict.points[2].passed).toBe(false);
    expect(strict.passed).toBe(false);
  });

  it('finds the worst point', () => {
    expect(worstPoint(test()).testLoadLb).toBe(50_000);
  });

  it('refuses a test with no points', () => {
    expect(() => test({ points: [] })).toThrow(/at least 1/);
  });

  it('refuses a day it cannot read', () => {
    expect(() => test({ day: 'august' })).toThrow(/YYYY-MM-DD/);
  });
});

describe('what the drift costs', () => {
  it('scales the nearest point to a working load', () => {
    expect(driftAt(test(), 50_000)).toBe(20);
    expect(driftAt(test(), 80_000)).toBe(32);
  });

  it('reads nothing on a scale that tested true', () => {
    const clean = test({
      points: [
        { testLoadLb: 10_000, indicatedLb: 10_000 },
        { testLoadLb: 50_000, indicatedLb: 50_000 },
      ],
    });
    expect(driftAt(clean, 50_000)).toBe(0);
  });
});

describe('when the next test is due', () => {
  it('is half a year on by default', () => {
    expect(DEFAULT_TEST_INTERVAL_DAYS).toBe(182);
    expect(nextTestDue(test())).toBe('2026-02-12');
  });

  it('knows when it is overdue', () => {
    expect(isOverdue(test(), '2026-02-12')).toBe(false);
    expect(isOverdue(test(), '2026-02-13')).toBe(true);
    expect(isOverdue(test(), '2025-12-01', 90)).toBe(true);
  });

  it('counts the days since', () => {
    expect(daysSince(test(), '2025-09-13')).toBe(30);
  });
});

describe('a run of tests', () => {
  it('sorts oldest first and shows the worst error each time', () => {
    const rows = history([
      test({ day: '2026-02-10', points: [{ testLoadLb: 50_000, indicatedLb: 50_080 }] }),
      test(),
    ]);
    expect(rows.map((row) => row.day)).toEqual(['2025-08-14', '2026-02-10']);
    expect(rows[1].worstErrorLb).toBe(80);
    expect(rows[1].passed).toBe(false);
  });

  it('refuses a history that mixes scales', () => {
    expect(() => history([test(), test({ scale: 'truck scale' })])).toThrow(/covers one scale/);
  });
});

describe('printing', () => {
  it('says who tested it and how it went', () => {
    const text = renderTest(test());
    expect(text).toContain('pit scale tested 2025-08-14 by state weights and measures: passed');
    expect(text).toContain('tolerance');
    expect(text).toContain('ok');
  });

  it('marks the points that were out', () => {
    expect(renderTest(test({ inService: false }))).toContain('out');
  });
});
