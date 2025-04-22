import { ConfigError } from '../core/errors.js';
import { isArray, isInteger, isPlainObject, isString, nonNegative, oneOf } from '../core/assert.js';
import { roundHalfUp } from '../core/numbers.js';
import { chargePerBushel } from '../core/money.js';
import { getCommodity } from '../commodity/registry.js';

/**
 * What comes off a settlement besides the discounts.
 *
 * Checkoff is the one that is easy to get wrong, because the two commodities
 * charge it differently. Corn is a flat rate a bushel. Soybeans are a share of
 * the value of the load, which means a checkoff on beans moves with the market
 * and a checkoff on corn does not.
 *
 * Some of these are refundable and some are not, and the settlement statement
 * has to say which, so the grower knows what he can ask for back.
 */

export const KINDS = Object.freeze(['perBushel', 'percentOfValue', 'flat']);

export function createAssessment(input) {
  isPlainObject(input, 'assessment');
  const kind = oneOf(input.kind, 'kind', KINDS);
  const assessment = {
    id: isString(input.id, 'id'),
    label: isString(input.label, 'label'),
    kind,
    refundable: input.refundable === true,
  };
  if (kind === 'perBushel') assessment.points = nonNegative(input.points, 'points');
  if (kind === 'percentOfValue') assessment.rate = nonNegative(input.rate, 'rate');
  if (kind === 'flat') assessment.cents = nonNegative(isInteger(input.cents, 'cents'), 'cents');
  return Object.freeze(assessment);
}

export function assessmentAmount(assessment, { bushelHundredths, grossCents }) {
  if (assessment.kind === 'perBushel') {
    return chargePerBushel(assessment.points, isInteger(bushelHundredths, 'bushelHundredths'));
  }
  if (assessment.kind === 'percentOfValue') {
    return Math.round(roundHalfUp(isInteger(grossCents, 'grossCents') * assessment.rate, 0));
  }
  return assessment.cents;
}

/** The checkoff the commodity itself carries, built from the registry entry. */
export function checkoffFor(commodityId) {
  const commodity = getCommodity(commodityId);
  const checkoff = commodity.checkoff;
  if (!checkoff) {
    throw new ConfigError('NO_CHECKOFF', `${commodityId} carries no checkoff`, {
      commodity: commodityId,
    });
  }
  return createAssessment({
    id: `${commodity.id}-checkoff`,
    label: `${commodity.name} checkoff`,
    kind: checkoff.kind,
    points: checkoff.points,
    rate: checkoff.rate,
    refundable: checkoff.kind === 'perBushel',
  });
}

/**
 * Run a list of assessments over one load. The order is fixed so two runs of
 * the same settlement print the same statement.
 */
export function applyAssessments(assessments, load) {
  isArray(assessments, 'assessments');
  const lines = assessments.map((assessment) => ({
    id: assessment.id,
    label: assessment.label,
    refundable: assessment.refundable,
    cents: assessmentAmount(assessment, load),
  }));
  return {
    lines,
    totalCents: lines.reduce((sum, line) => sum + line.cents, 0),
    refundableCents: lines
      .filter((line) => line.refundable)
      .reduce((sum, line) => sum + line.cents, 0),
  };
}

/** A flat charge for something the house did, such as unloading after hours. */
export function serviceCharge(id, label, cents) {
  return createAssessment({ id, label, kind: 'flat', cents });
}

export function perBushelCharge(id, label, points) {
  return createAssessment({ id, label, kind: 'perBushel', points });
}
