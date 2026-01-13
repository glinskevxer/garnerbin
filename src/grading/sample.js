import { TicketError } from '../core/errors.js';
import { inRange, isArray, isPlainObject, isString, positive } from '../core/assert.js';
import { roundHalfUp } from '../core/numbers.js';
import { assertDay } from '../core/dates.js';
import { assertCommodityId } from '../commodity/registry.js';
import { getFactor } from './factors.js';

/**
 * The sample record.
 *
 * One of these comes off the probe truck for every load. It holds the readings
 * the grader took, the condition flags nobody can measure with a meter, and the
 * grams the sample weighed, because the grams are what lets several probes be
 * composited into one honest set of numbers.
 */

const READING_RANGES = {
  testWeight: [30, 70],
  damagedTotal: [0, 100],
  heatDamaged: [0, 100],
  bcfm: [0, 100],
  bnfm: [0, 100],
  foreignMaterial: [0, 100],
  splits: [0, 100],
  otherColors: [0, 100],
  shrunkenBroken: [0, 100],
  defects: [0, 100],
  wheatOtherClasses: [0, 100],
  contrastingClasses: [0, 100],
  moisture: [0, 45],
  dockage: [0, 100],
  protein: [0, 30],
  fallingNumber: [0, 600],
  ergotPercent: [0, 100],
};

const COUNT_FIELDS = ['liveWeevils', 'otherLiveInsects', 'garlicBulblets', 'smutBalls'];

const FLAG_FIELDS = [
  'treated',
  'smutOdor',
  'purpleMottled',
  'smutCoated',
  'heating',
  'musty',
  'sour',
  'commerciallyObjectionableOdor',
  'animalFilth',
  'glass',
  'stones',
  'unknownForeignSubstance',
  'castorBeans',
  'distinctlyLowQuality',
];

export function isReadingField(key) {
  return Object.prototype.hasOwnProperty.call(READING_RANGES, key);
}

export function isCountField(key) {
  return COUNT_FIELDS.includes(key);
}

export function isFlagField(key) {
  return FLAG_FIELDS.includes(key);
}

/** Validate and normalise one probe or one composite. */
export function createSample(input) {
  isPlainObject(input, 'sample');
  const commodity = assertCommodityId(input.commodity);
  const sample = {
    id: isString(input.id, 'id'),
    commodity,
    day: assertDay(input.day, 'day'),
    grams: positive(input.grams ?? 1000, 'grams'),
    grader: input.grader === undefined ? null : isString(input.grader, 'grader'),
  };
  for (const [key, value] of Object.entries(input)) {
    if (['id', 'commodity', 'day', 'grams', 'grader'].includes(key)) continue;
    if (isReadingField(key)) {
      const [low, high] = READING_RANGES[key];
      const places = tryPlaces(key);
      sample[key] = roundHalfUp(inRange(value, key, low, high), places);
      continue;
    }
    if (isCountField(key)) {
      sample[key] = inRange(value, key, 0, 10_000);
      continue;
    }
    if (isFlagField(key)) {
      if (typeof value !== 'boolean') {
        throw new TicketError('NOT_A_FLAG', `${key} must be true or false`, { field: key });
      }
      sample[key] = value;
      continue;
    }
    throw new TicketError('UNKNOWN_SAMPLE_FIELD', `nothing on a sample is called ${key}`, {
      field: key,
    });
  }
  return Object.freeze(sample);
}

function tryPlaces(key) {
  try {
    return getFactor(key).places;
  } catch {
    return 2;
  }
}

/**
 * Composite several probes into one sample.
 *
 * Readings are weighted by the grams behind them, counts add up, and any flag
 * set on any probe carries into the composite. A weevil found in one probe is a
 * weevil in the load.
 */
export function compositeSample(samples, { id, grader = null } = {}) {
  isArray(samples, 'samples', { minLength: 1 });
  const first = samples[0];
  for (const sample of samples) {
    if (sample.commodity !== first.commodity) {
      throw new TicketError('MIXED_COMPOSITE', 'a composite cannot mix commodities', {
        found: [...new Set(samples.map((entry) => entry.commodity))],
      });
    }
  }
  const totalGrams = samples.reduce((sum, sample) => sum + sample.grams, 0);
  const composite = {
    id: id ?? `${first.id}-composite`,
    commodity: first.commodity,
    day: samples.map((sample) => sample.day).sort()[0],
    grams: roundHalfUp(totalGrams, 2),
    grader,
  };
  for (const key of Object.keys(READING_RANGES)) {
    const present = samples.filter((sample) => typeof sample[key] === 'number');
    if (present.length === 0) continue;
    const grams = present.reduce((sum, sample) => sum + sample.grams, 0);
    const weighted = present.reduce((sum, sample) => sum + sample[key] * sample.grams, 0);
    composite[key] = roundHalfUp(weighted / grams, tryPlaces(key));
  }
  for (const key of COUNT_FIELDS) {
    const present = samples.filter((sample) => typeof sample[key] === 'number');
    if (present.length > 0) {
      composite[key] = present.reduce((sum, sample) => sum + sample[key], 0);
    }
  }
  for (const key of FLAG_FIELDS) {
    if (samples.some((sample) => sample[key] === true)) composite[key] = true;
  }
  return Object.freeze(composite);
}

export function readingsOf(sample) {
  const readings = {};
  for (const key of Object.keys(READING_RANGES)) {
    if (typeof sample[key] === 'number') readings[key] = sample[key];
  }
  return readings;
}

/** Index a set of samples by id so a ticket can find the one that belongs to it. */
export function sampleIndex(samples) {
  isArray(samples, 'samples');
  return new Map(samples.map((sample) => [sample.id, sample]));
}

export function sampleForTicket(index, ticket) {
  if (!ticket.sampleId) {
    throw new TicketError('TICKET_HAS_NO_SAMPLE', `${ticket.number} names no sample`, {
      ticket: ticket.number,
    });
  }
  const sample = index.get(ticket.sampleId);
  if (!sample) {
    throw new TicketError(
      'SAMPLE_NOT_FOUND',
      `${ticket.number} names sample ${ticket.sampleId}, which is not in the file`,
      { ticket: ticket.number, sample: ticket.sampleId }
    );
  }
  return sample;
}
