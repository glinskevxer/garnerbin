import { isPlainObject } from '../core/assert.js';
import { assertCommodityId, isWheat } from '../commodity/registry.js';
import { determineGrade } from './grade.js';
import { SAMPLE_GRADE } from './standards.js';

/**
 * Special grades and the conditions that force sample grade.
 *
 * A special grade rides along with the numeric grade. Number two hard red
 * winter wheat can be ergoty, and it is still number two, it just sells for
 * less and it cannot go on a milling contract.
 *
 * The sample grade conditions are different. They are not a factor with a
 * limit, they are a state of the grain, and any one of them takes the load
 * straight to sample grade whatever the numbers say.
 */

/**
 * Infestation is measured the same way in every one of these standards: two
 * live weevils, or one weevil in company, or ten other live insects.
 */
export function isInfested(sample) {
  const weevils = sample.liveWeevils ?? 0;
  const others = sample.otherLiveInsects ?? 0;
  if (weevils >= 2) return true;
  if (weevils >= 1 && others >= 5) return true;
  return others >= 10;
}

function wheatSpecials(sample) {
  const found = [];
  if ((sample.ergotPercent ?? 0) > 0.05) found.push('ergoty');
  if ((sample.garlicBulblets ?? 0) >= 2) found.push('garlicky');
  const smutBalls = sample.smutBalls ?? 0;
  if (smutBalls > 30) found.push('smutty');
  else if (smutBalls >= 5 || sample.smutOdor === true) found.push('light smutty');
  return found;
}

function soybeanSpecials(sample) {
  const found = [];
  if ((sample.garlicBulblets ?? 0) >= 5) found.push('garlicky');
  if (sample.purpleMottled === true) found.push('purple mottled or stained');
  return found;
}

function sorghumSpecials(sample) {
  return sample.smutCoated === true ? ['smutty'] : [];
}

/** Every special grade this sample earns, in the order the certificate prints them. */
export function specialGrades(commodityId, sample) {
  const id = assertCommodityId(commodityId);
  isPlainObject(sample, 'sample');
  const found = [];
  if (isInfested(sample)) found.push('infested');
  if (sample.treated === true) found.push('treated');
  if (isWheat(id)) found.push(...wheatSpecials(sample));
  if (id === 'soybeans') found.push(...soybeanSpecials(sample));
  if (id === 'sorghum') found.push(...sorghumSpecials(sample));
  return found;
}

const SAMPLE_GRADE_CONDITIONS = [
  ['heating', 'the grain is heating'],
  ['musty', 'a musty odor'],
  ['sour', 'a sour odor'],
  ['commerciallyObjectionableOdor', 'a commercially objectionable foreign odor'],
  ['animalFilth', 'animal filth'],
  ['glass', 'glass'],
  ['stones', 'stones over the tolerance'],
  ['unknownForeignSubstance', 'an unknown foreign substance'],
  ['castorBeans', 'castor beans'],
  ['distinctlyLowQuality', 'distinctly low quality'],
];

/** The reasons, in words, that this load cannot hold a numeric grade. */
export function sampleGradeReasons(sample) {
  isPlainObject(sample, 'sample');
  return SAMPLE_GRADE_CONDITIONS.filter(([field]) => sample[field] === true).map(
    ([, reason]) => reason
  );
}

/**
 * The whole grade. Numbers first, then the conditions that override them, then
 * the special grades that ride along either way.
 */
export function gradeSample(commodityId, sample) {
  const numeric = determineGrade(commodityId, sample);
  const reasons = sampleGradeReasons(sample);
  const specials = specialGrades(commodityId, sample);
  const grade = reasons.length > 0 ? SAMPLE_GRADE : numeric.grade;
  return {
    ...numeric,
    grade,
    label: describeGrade(grade, specials),
    numericGrade: numeric.grade,
    sampleGradeReasons: reasons,
    specialGrades: specials,
  };
}

export function describeGrade(grade, specials = []) {
  const base = grade === SAMPLE_GRADE ? 'US Sample grade' : `US No. ${grade}`;
  return specials.length === 0 ? base : `${base}, ${specials.join(', ')}`;
}

/** Milling and food contracts refuse these outright, whatever the numbers say. */
export const MILLING_DISQUALIFIERS = Object.freeze([
  'ergoty',
  'smutty',
  'garlicky',
  'treated',
  'infested',
]);

export function millingEligible(commodityId, sample) {
  const graded = gradeSample(commodityId, sample);
  if (graded.grade === SAMPLE_GRADE) return false;
  return !graded.specialGrades.some((special) => MILLING_DISQUALIFIERS.includes(special));
}
