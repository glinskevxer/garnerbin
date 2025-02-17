import { GradeError } from '../core/errors.js';
import { isString } from '../core/assert.js';
import { roundHalfUp } from '../core/numbers.js';

/**
 * The catalogue of things a grader measures.
 *
 * direction says which way the limit runs. Test weight is the only one where a
 * bigger number is better, and forgetting that is how a light load ends up
 * graded No. 1.
 *
 * gradeDetermining marks the ones that can hold a load out of a grade. Moisture
 * is not one of them, which surprises every new scale operator: a load at
 * twenty two percent is still No. 2 corn, it is just expensive No. 2 corn.
 */

const FACTORS = {
  testWeight: {
    id: 'testWeight',
    label: 'Test weight',
    unit: 'lb/bu',
    direction: 'min',
    places: 1,
    gradeDetermining: true,
  },
  damagedTotal: {
    id: 'damagedTotal',
    label: 'Damaged kernels, total',
    unit: '%',
    direction: 'max',
    places: 1,
    gradeDetermining: true,
  },
  heatDamaged: {
    id: 'heatDamaged',
    label: 'Heat damaged kernels',
    unit: '%',
    direction: 'max',
    places: 1,
    gradeDetermining: true,
  },
  bcfm: {
    id: 'bcfm',
    label: 'Broken corn and foreign material',
    unit: '%',
    direction: 'max',
    places: 1,
    gradeDetermining: true,
  },
  bnfm: {
    id: 'bnfm',
    label: 'Broken kernels and foreign material',
    unit: '%',
    direction: 'max',
    places: 1,
    gradeDetermining: true,
  },
  foreignMaterial: {
    id: 'foreignMaterial',
    label: 'Foreign material',
    unit: '%',
    direction: 'max',
    places: 1,
    gradeDetermining: true,
  },
  splits: {
    id: 'splits',
    label: 'Splits',
    unit: '%',
    direction: 'max',
    places: 1,
    gradeDetermining: true,
  },
  otherColors: {
    id: 'otherColors',
    label: 'Soybeans of other colors',
    unit: '%',
    direction: 'max',
    places: 1,
    gradeDetermining: true,
  },
  shrunkenBroken: {
    id: 'shrunkenBroken',
    label: 'Shrunken and broken kernels',
    unit: '%',
    direction: 'max',
    places: 1,
    gradeDetermining: true,
  },
  defects: {
    id: 'defects',
    label: 'Defects, total',
    unit: '%',
    direction: 'max',
    places: 1,
    gradeDetermining: true,
  },
  wheatOtherClasses: {
    id: 'wheatOtherClasses',
    label: 'Wheat of other classes',
    unit: '%',
    direction: 'max',
    places: 1,
    gradeDetermining: true,
  },
  contrastingClasses: {
    id: 'contrastingClasses',
    label: 'Contrasting classes',
    unit: '%',
    direction: 'max',
    places: 1,
    gradeDetermining: true,
  },
  moisture: {
    id: 'moisture',
    label: 'Moisture',
    unit: '%',
    direction: 'max',
    places: 1,
    gradeDetermining: false,
  },
  dockage: {
    id: 'dockage',
    label: 'Dockage',
    unit: '%',
    direction: 'max',
    places: 1,
    gradeDetermining: false,
  },
  protein: {
    id: 'protein',
    label: 'Protein, twelve percent basis',
    unit: '%',
    direction: 'min',
    places: 1,
    gradeDetermining: false,
  },
  fallingNumber: {
    id: 'fallingNumber',
    label: 'Falling number',
    unit: 'sec',
    direction: 'min',
    places: 0,
    gradeDetermining: false,
  },
};

for (const factor of Object.values(FACTORS)) Object.freeze(factor);
Object.freeze(FACTORS);

export const FACTOR_IDS = Object.freeze(Object.keys(FACTORS));

export function getFactor(id) {
  isString(id, 'factor');
  const found = FACTORS[id];
  if (!found) {
    throw new GradeError('NO_SUCH_FACTOR', `${id} is not a factor the grader measures`, {
      factor: id,
    });
  }
  return found;
}

export function listFactors() {
  return FACTOR_IDS.map((id) => FACTORS[id]);
}

export function gradeDeterminingFactors() {
  return listFactors().filter((factor) => factor.gradeDetermining);
}

/** Does this reading sit inside the limit, given which way the limit runs. */
export function meetsLimit(factorId, value, limit) {
  const factor = getFactor(factorId);
  const reading = roundHalfUp(value, factor.places);
  return factor.direction === 'min' ? reading >= limit : reading <= limit;
}

/** How far outside the limit the reading is, zero when it is inside. */
export function overage(factorId, value, limit) {
  const factor = getFactor(factorId);
  const reading = roundHalfUp(value, factor.places);
  const gap = factor.direction === 'min' ? limit - reading : reading - limit;
  return gap > 0 ? roundHalfUp(gap, factor.places) : 0;
}

export function formatFactor(factorId, value) {
  const factor = getFactor(factorId);
  return `${roundHalfUp(value, factor.places).toFixed(factor.places)} ${factor.unit}`;
}
