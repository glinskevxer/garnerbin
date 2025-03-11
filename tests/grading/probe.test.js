import { describe, expect, it } from 'vitest';
import { createSample } from '../../src/grading/sample.js';
import {
  CARRIER_IDS,
  checkPattern,
  compositeForLoad,
  getCarrier,
  isGradeable,
  requiredProbes,
} from '../../src/grading/probe.js';

const trailer = getCarrier('hopperTrailer');

function probe(position, overrides = {}) {
  return {
    position,
    sample: createSample({
      id: `P-${position}`,
      commodity: 'corn',
      day: '2025-10-04',
      testWeight: 55,
      damagedTotal: 2,
      heatDamaged: 0,
      bcfm: 2,
      moisture: 16,
      ...overrides,
    }),
  };
}

describe('carriers', () => {
  it('knows the carriers that come to the pit', () => {
    expect(CARRIER_IDS).toContain('hopperTrailer');
    expect(CARRIER_IDS).toContain('boxcar');
    expect(getCarrier('boxcar').minProbes).toBe(10);
    expect(trailer.positions).toHaveLength(5);
  });

  it('refuses a carrier it does not know', () => {
    expect(() => getCarrier('pickup')).toThrow(/must be one of/);
  });
});

describe('requiredProbes', () => {
  it('gives the pattern count when nothing else is said', () => {
    expect(requiredProbes('straightTruck')).toBe(3);
    expect(requiredProbes('hopperTrailer')).toBe(5);
    expect(requiredProbes('barge')).toBe(12);
  });

  it('adds probes when more than one compartment is loaded', () => {
    expect(requiredProbes('hopperTrailer', { compartmentsLoaded: 1 })).toBe(5);
    expect(requiredProbes('hopperTrailer', { compartmentsLoaded: 2 })).toBe(6);
    expect(requiredProbes('railcarHopper', { compartmentsLoaded: 3 })).toBe(6);
  });

  it('refuses more compartments than the carrier has', () => {
    expect(() => requiredProbes('straightTruck', { compartmentsLoaded: 2 })).toThrow(
      /a Straight truck has 1/
    );
  });
});

describe('checkPattern', () => {
  it('passes a full pattern', () => {
    const result = checkPattern('hopperTrailer', trailer.positions);
    expect(result.problems).toEqual([]);
    expect(result.taken).toBe(5);
    expect(isGradeable('hopperTrailer', trailer.positions)).toBe(true);
  });

  it('catches a short pattern', () => {
    const result = checkPattern('hopperTrailer', trailer.positions.slice(0, 3));
    expect(result.problems[0]).toBe('3 probes where the pattern calls for 5');
    expect(isGradeable('hopperTrailer', trailer.positions.slice(0, 3))).toBe(false);
  });

  it('catches the same spot probed twice', () => {
    const positions = [...trailer.positions.slice(0, 4), 'middle'];
    const result = checkPattern('hopperTrailer', positions);
    expect(result.problems).toContain('middle probed more than once');
  });

  it('catches a position the carrier does not have', () => {
    const positions = [...trailer.positions.slice(0, 4), 'roof'];
    const result = checkPattern('hopperTrailer', positions);
    expect(result.problems.some((problem) => problem.includes('roof'))).toBe(true);
  });
});

describe('compositeForLoad', () => {
  it('composites a properly probed load', () => {
    const probes = trailer.positions.map((position) => probe(position));
    const composite = compositeForLoad('hopperTrailer', probes, { id: 'L-77' });
    expect(composite.id).toBe('L-77');
    expect(composite.grams).toBe(5000);
    expect(composite.testWeight).toBe(55);
  });

  it('weights a wet corner into the composite', () => {
    const probes = trailer.positions.map((position) =>
      position === 'rear left' ? probe(position, { moisture: 22 }) : probe(position)
    );
    const composite = compositeForLoad('hopperTrailer', probes);
    expect(composite.moisture).toBe(17.2);
  });

  it('refuses to grade a load that was probed short', () => {
    const probes = trailer.positions.slice(0, 3).map((position) => probe(position));
    expect(() => compositeForLoad('hopperTrailer', probes)).toThrow(/pattern calls for 5/);
  });

  it('refuses an empty probe list', () => {
    expect(() => compositeForLoad('hopperTrailer', [])).toThrow(/at least 1/);
  });
});
