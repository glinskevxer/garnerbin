import { GradeError } from '../core/errors.js';
import { isPlainObject } from '../core/assert.js';
import { meetsLimit, overage } from './factors.js';
import { factorsFor, gradesFor, limitOf, SAMPLE_GRADE } from './standards.js';

/**
 * Grade determination.
 *
 * The rule is worst factor wins. Work out the best grade each factor on its own
 * would allow, and the load grades at the worst of those. Nothing averages and
 * nothing trades off: one tenth of a percent of heat damage over the line drops
 * the whole load a grade no matter how clean the rest of it is.
 */

/** The best grade this one reading allows, or sample grade if it misses them all. */
export function factorGrade(commodityId, factorId, value) {
  for (const grade of gradesFor(commodityId)) {
    if (meetsLimit(factorId, value, limitOf(commodityId, grade, factorId))) return grade;
  }
  return SAMPLE_GRADE;
}

function requireReadings(commodityId, readings) {
  isPlainObject(readings, 'readings');
  const needed = factorsFor(commodityId);
  const missing = needed.filter((factorId) => typeof readings[factorId] !== 'number');
  if (missing.length > 0) {
    throw new GradeError(
      'INCOMPLETE_SAMPLE',
      `the ${commodityId} grade needs ${missing.join(', ')}`,
      {
        commodity: commodityId,
        missing,
      }
    );
  }
  return needed;
}

export function isWorse(a, b) {
  if (a === b) return false;
  if (a === SAMPLE_GRADE) return true;
  if (b === SAMPLE_GRADE) return false;
  return a > b;
}

export function compareGrades(a, b) {
  if (a === b) return 0;
  return isWorse(a, b) ? 1 : -1;
}

export function gradeLabel(grade) {
  return grade === SAMPLE_GRADE ? 'US Sample grade' : `US No. ${grade}`;
}

/** Is the load good enough for a contract that calls for this grade. */
export function meetsContractGrade(actual, required) {
  return compareGrades(actual, required) <= 0;
}

/**
 * Grade a set of readings.
 *
 * limitingFactors are the ones sitting at the final grade. They are what the
 * grader writes on the certificate and what the merchandiser argues about, so
 * they come back with the reading and the limit that caught it.
 */
export function determineGrade(commodityId, readings) {
  const needed = requireReadings(commodityId, readings);
  const byFactor = {};
  let grade = gradesFor(commodityId)[0];
  for (const factorId of needed) {
    const reached = factorGrade(commodityId, factorId, readings[factorId]);
    byFactor[factorId] = reached;
    if (isWorse(reached, grade)) grade = reached;
  }
  const limitingFactors = needed
    .filter((factorId) => byFactor[factorId] === grade)
    .map((factorId) => ({
      factor: factorId,
      value: readings[factorId],
      limit: grade === SAMPLE_GRADE ? null : limitOf(commodityId, grade, factorId),
    }));
  return {
    commodity: commodityId,
    grade,
    label: gradeLabel(grade),
    byFactor,
    limitingFactors,
  };
}

/**
 * What is holding this load out of a better grade, and by how much. The
 * merchandiser asks this every time a load lands one grade under the contract.
 */
export function shortOf(commodityId, readings, target) {
  const needed = requireReadings(commodityId, readings);
  const gaps = [];
  for (const factorId of needed) {
    const limit = limitOf(commodityId, target, factorId);
    const gap = overage(factorId, readings[factorId], limit);
    if (gap > 0) gaps.push({ factor: factorId, value: readings[factorId], limit, gap });
  }
  return gaps;
}

/** Would this load make the target grade if the factors named were fixed. */
export function wouldMake(commodityId, readings, target, ignoring = []) {
  const gaps = shortOf(commodityId, readings, target);
  return gaps.every((gap) => ignoring.includes(gap.factor));
}
