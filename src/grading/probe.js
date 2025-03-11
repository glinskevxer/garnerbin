import { TicketError } from '../core/errors.js';
import { isArray, isInteger, oneOf, positive } from '../core/assert.js';
import { joinList } from '../core/text.js';
import { compositeSample } from './sample.js';

/**
 * How a load gets probed.
 *
 * The probe pattern is not a formality. A trailer sampled down the middle and
 * nowhere else will miss a wet corner every time, and the wet corner is what
 * heats in the bin in July. Each carrier has a required count and a set of
 * named positions, and a load probed short of the pattern is not gradeable.
 */

const CARRIERS = {
  straightTruck: {
    id: 'straightTruck',
    label: 'Straight truck',
    minProbes: 3,
    positions: ['front', 'middle', 'rear'],
    compartments: 1,
  },
  hopperTrailer: {
    id: 'hopperTrailer',
    label: 'Hopper bottom trailer',
    minProbes: 5,
    positions: ['front left', 'front right', 'middle', 'rear left', 'rear right'],
    compartments: 2,
  },
  bellyDump: {
    id: 'bellyDump',
    label: 'Belly dump trailer',
    minProbes: 5,
    positions: ['front left', 'front right', 'middle', 'rear left', 'rear right'],
    compartments: 2,
  },
  railcarHopper: {
    id: 'railcarHopper',
    label: 'Covered hopper car',
    minProbes: 5,
    positions: ['hatch 1', 'hatch 2', 'hatch 3', 'hatch 4', 'hatch 5'],
    compartments: 3,
  },
  boxcar: {
    id: 'boxcar',
    label: 'Box car',
    minProbes: 10,
    positions: [
      'door left',
      'door right',
      'end a left',
      'end a centre',
      'end a right',
      'end b left',
      'end b centre',
      'end b right',
      'centre left',
      'centre right',
    ],
    compartments: 1,
  },
  barge: {
    id: 'barge',
    label: 'Barge',
    minProbes: 12,
    positions: Array.from({ length: 12 }, (_, index) => `station ${index + 1}`),
    compartments: 1,
  },
};

Object.freeze(CARRIERS);

export const CARRIER_IDS = Object.freeze(Object.keys(CARRIERS));

export function getCarrier(id) {
  oneOf(id, 'carrier', CARRIER_IDS);
  return CARRIERS[id];
}

export function requiredProbes(carrierId, { compartmentsLoaded } = {}) {
  const carrier = getCarrier(carrierId);
  if (compartmentsLoaded === undefined) return carrier.minProbes;
  isInteger(compartmentsLoaded, 'compartmentsLoaded');
  positive(compartmentsLoaded, 'compartmentsLoaded');
  if (compartmentsLoaded > carrier.compartments) {
    throw new TicketError(
      'TOO_MANY_COMPARTMENTS',
      `a ${carrier.label} has ${carrier.compartments}`,
      {
        carrier: carrierId,
        compartments: carrier.compartments,
        compartmentsLoaded,
      }
    );
  }
  const perCompartment = Math.ceil(carrier.minProbes / carrier.compartments);
  return Math.max(carrier.minProbes, perCompartment * compartmentsLoaded);
}

/**
 * Check a pattern before the load is graded. The two failures worth catching
 * are too few probes and the same position probed twice, which is what happens
 * when the probe truck moves and nobody writes down where it moved to.
 */
export function checkPattern(carrierId, positions, options = {}) {
  const carrier = getCarrier(carrierId);
  isArray(positions, 'positions');
  const needed = requiredProbes(carrierId, options);
  const problems = [];
  if (positions.length < needed) {
    problems.push(`${positions.length} probes where the pattern calls for ${needed}`);
  }
  const seen = new Set();
  const repeated = new Set();
  for (const position of positions) {
    if (seen.has(position)) repeated.add(position);
    seen.add(position);
  }
  if (repeated.size > 0) {
    problems.push(`${joinList([...repeated])} probed more than once`);
  }
  const unknown = positions.filter((position) => !carrier.positions.includes(position));
  if (unknown.length > 0) {
    problems.push(`${joinList(unknown)} is not a position on a ${carrier.label.toLowerCase()}`);
  }
  return { carrier: carrierId, required: needed, taken: positions.length, problems };
}

export function isGradeable(carrierId, positions, options = {}) {
  return checkPattern(carrierId, positions, options).problems.length === 0;
}

/**
 * Build the composite the grader actually works from, refusing the load when
 * the pattern was not met rather than quietly grading a thin sample.
 */
export function compositeForLoad(carrierId, probes, options = {}) {
  isArray(probes, 'probes', { minLength: 1 });
  const positions = probes.map((probe) => probe.position);
  const check = checkPattern(carrierId, positions, options);
  if (check.problems.length > 0) {
    throw new TicketError('PATTERN_NOT_MET', check.problems.join('; '), {
      carrier: carrierId,
      ...check,
    });
  }
  return compositeSample(
    probes.map((probe) => probe.sample),
    { id: options.id, grader: options.grader ?? null }
  );
}
