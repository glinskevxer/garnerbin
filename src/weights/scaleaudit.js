import { ConfigError } from '../core/errors.js';
import { isArray, isPlainObject, isString, positive } from '../core/assert.js';
import { roundHalfUp } from '../core/numbers.js';
import { addDays, assertDay, compareDays, daysBetween } from '../core/dates.js';
import { renderTable } from '../core/text.js';

/**
 * Scale tests.
 *
 * The state inspector comes once a year and the house tests in between, because
 * a scale that has drifted a hundred pounds is taking a hundred pounds off
 * every grower who crosses it and nobody finds out from the tickets.
 *
 * Tolerances run in scale divisions rather than in pounds, and they widen with
 * the test load: half a division up to five thousand divisions, one up to ten
 * thousand, one and a half above that. Maintenance tolerance, the one that
 * applies to a scale in service, is twice the acceptance tolerance.
 */

export const MAINTENANCE_MULTIPLIER = 2;

/** Acceptance tolerance, in divisions, for a test load measured in divisions. */
export function acceptanceDivisions(testLoadDivisions) {
  positive(testLoadDivisions, 'testLoadDivisions');
  if (testLoadDivisions <= 5000) return 0.5;
  if (testLoadDivisions <= 10_000) return 1;
  return 1.5;
}

export function toleranceLb(testLoadLb, divisionLb, { inService = true } = {}) {
  positive(testLoadLb, 'testLoadLb');
  positive(divisionLb, 'divisionLb');
  const divisions = testLoadLb / divisionLb;
  const acceptance = acceptanceDivisions(divisions) * divisionLb;
  return inService ? acceptance * MAINTENANCE_MULTIPLIER : acceptance;
}

export function createScaleTest(input) {
  isPlainObject(input, 'test');
  const divisionLb = positive(input.divisionLb ?? 20, 'divisionLb');
  const points = isArray(input.points, 'points', { minLength: 1 }).map((point) => {
    isPlainObject(point, 'point');
    const testLoadLb = positive(point.testLoadLb, 'testLoadLb');
    const indicatedLb = positive(point.indicatedLb, 'indicatedLb');
    const error = roundHalfUp(indicatedLb - testLoadLb, 2);
    const tolerance = toleranceLb(testLoadLb, divisionLb, { inService: input.inService !== false });
    return Object.freeze({
      testLoadLb,
      indicatedLb,
      errorLb: error,
      toleranceLb: roundHalfUp(tolerance, 2),
      passed: Math.abs(error) <= tolerance,
    });
  });
  return Object.freeze({
    scale: isString(input.scale, 'scale'),
    day: assertDay(input.day, 'day'),
    inspector: input.inspector === undefined ? null : isString(input.inspector, 'inspector'),
    divisionLb,
    inService: input.inService !== false,
    points: Object.freeze(points),
    passed: points.every((point) => point.passed),
  });
}

export function worstPoint(test) {
  return test.points.reduce((worst, point) =>
    Math.abs(point.errorLb) > Math.abs(worst.errorLb) ? point : worst
  );
}

/**
 * The drift a test implies at a working load. A scale that reads a hundred
 * pounds heavy at fifty thousand is worth about two bushels of corn a load, and
 * that is the number the manager understands.
 */
export function driftAt(test, loadLb) {
  positive(loadLb, 'loadLb');
  const nearest = test.points.reduce((closest, point) =>
    Math.abs(point.testLoadLb - loadLb) < Math.abs(closest.testLoadLb - loadLb) ? point : closest
  );
  if (nearest.testLoadLb === 0) return 0;
  return roundHalfUp((nearest.errorLb / nearest.testLoadLb) * loadLb, 1);
}

export const DEFAULT_TEST_INTERVAL_DAYS = 182;

export function nextTestDue(test, intervalDays = DEFAULT_TEST_INTERVAL_DAYS) {
  return addDays(test.day, intervalDays);
}

export function isOverdue(test, asOf, intervalDays = DEFAULT_TEST_INTERVAL_DAYS) {
  return compareDays(assertDay(asOf, 'asOf'), nextTestDue(test, intervalDays)) > 0;
}

export function daysSince(test, asOf) {
  return daysBetween(test.day, assertDay(asOf, 'asOf'));
}

/** A run of tests, oldest first, so a drift that is growing is visible. */
export function history(tests) {
  isArray(tests, 'tests', { minLength: 1 });
  const scales = new Set(tests.map((test) => test.scale));
  if (scales.size > 1) {
    throw new ConfigError('MIXED_SCALES', 'a history covers one scale', { scales: [...scales] });
  }
  return [...tests]
    .sort((a, b) => compareDays(a.day, b.day))
    .map((test) => ({
      day: test.day,
      passed: test.passed,
      worstErrorLb: worstPoint(test).errorLb,
      points: test.points.length,
    }));
}

export function renderTest(test) {
  return [
    `${test.scale} tested ${test.day}${test.inspector ? ` by ${test.inspector}` : ''}: ${test.passed ? 'passed' : 'failed'}`,
    renderTable(
      [
        { header: 'test load', key: 'testLoadLb', align: 'right' },
        { header: 'indicated', key: 'indicatedLb', align: 'right' },
        { header: 'error', key: 'errorLb', align: 'right' },
        { header: 'tolerance', key: 'toleranceLb', align: 'right' },
        { header: 'result', value: (point) => (point.passed ? 'ok' : 'out') },
      ],
      test.points
    ),
  ].join('\n');
}
