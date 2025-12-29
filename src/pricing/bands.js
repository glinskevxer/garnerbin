import { ConfigError } from '../core/errors.js';
import { isArray, isFiniteNumber, isPlainObject, nonNegative } from '../core/assert.js';
import { roundHalfUp } from '../core/numbers.js';

/**
 * Bands.
 *
 * A band is a half open range of readings and a rate inside it. The discount
 * schedule is built out of them and so is anything else the house posts as a
 * table on the wall, so the checking lives here rather than being written out
 * again each time.
 *
 * The two rules that matter are that bands have to be contiguous and that the
 * last one has to run open ended. A reading that falls into no band would
 * quietly cost nothing, which is the sort of bug that only shows up when a load
 * so bad nobody planned for it comes across the scale.
 */

export function normaliseBands(bands, what = 'the schedule') {
  isArray(bands, 'bands', { minLength: 1 });
  const built = bands.map((band, index) => {
    isPlainObject(band, 'band');
    const from = isFiniteNumber(band.from, 'from');
    const to = band.to === null || band.to === undefined ? null : isFiniteNumber(band.to, 'to');
    if (to !== null && to <= from) {
      throw new ConfigError('BAND_INVERTED', `${what} band ${index} ends at or before it starts`, {
        what,
        index,
      });
    }
    const entry = { from, to };
    if (band.pointsPerUnit !== undefined) {
      entry.pointsPerUnit = nonNegative(band.pointsPerUnit, 'pointsPerUnit');
      entry.step = band.step ?? 1;
      if (entry.step <= 0) {
        throw new ConfigError('BAD_STEP', `${what} band ${index} has a step of ${entry.step}`, {
          what,
          index,
        });
      }
    } else {
      entry.points = nonNegative(band.points ?? 0, 'points');
    }
    return Object.freeze(entry);
  });
  for (let index = 1; index < built.length; index += 1) {
    if (built[index - 1].to !== built[index].from) {
      throw new ConfigError('BANDS_NOT_CONTIGUOUS', `${what} has a hole before band ${index}`, {
        what,
        index,
      });
    }
  }
  if (built[built.length - 1].to !== null) {
    throw new ConfigError('BANDS_NOT_OPEN', `${what} does not cover its worst readings`, { what });
  }
  return Object.freeze(built);
}

export function bandContaining(bands, value) {
  isFiniteNumber(value, 'value');
  return bands.find((band) => value >= band.from && (band.to === null || value < band.to)) ?? null;
}

/** The rate a band charges at this reading, flat or stepped from the band floor. */
export function rateIn(band, value) {
  if (band === null) return 0;
  if (band.points !== undefined) return band.points;
  const over = Math.max(0, value - band.from);
  const steps = Math.ceil(roundHalfUp(over / band.step, 6));
  return roundHalfUp(steps * band.pointsPerUnit, 4);
}

export function rateFor(bands, value) {
  return rateIn(bandContaining(bands, value), value);
}

/** The whole table, for printing on the wall. */
export function bandTable(bands) {
  return bands.map((band) => ({
    from: band.from,
    to: band.to,
    rate: band.points !== undefined ? band.points : null,
    perUnit: band.pointsPerUnit ?? null,
    step: band.step ?? null,
  }));
}
