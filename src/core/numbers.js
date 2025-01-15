import { ArithmeticError } from './errors.js';
import { isFiniteNumber, isInteger, nonNegative } from './assert.js';

/**
 * Rounding at an elevator is not one policy. Bushels are truncated, discounts
 * are rounded half up at the cent, moisture is reported to a tenth, and the
 * federal tables round half up at the tenth of a percent. Doing that with bare
 * Math.round on floats gets 2.675 wrong often enough to cost a settlement, so
 * everything here scales to an integer first.
 */

const MAX_PLACES = 8;

function scaleOf(places) {
  isInteger(places, 'places');
  nonNegative(places, 'places');
  if (places > MAX_PLACES) {
    throw new ArithmeticError('TOO_MANY_PLACES', `cannot work past ${MAX_PLACES} decimal places`, {
      places,
    });
  }
  return 10 ** places;
}

/**
 * Scale a float to an integer without the usual 1.005 * 100 = 100.49999 bite.
 * Going through the decimal string is slower than multiplying and it is the
 * only version that agrees with what the operator typed.
 */
export function scaledInteger(value, places) {
  isFiniteNumber(value, 'value');
  const scale = scaleOf(places);
  const shifted = Number(`${value}e${places}`);
  if (Number.isFinite(shifted)) return shifted;
  return value * scale;
}

/** Round half away from zero. This is what the grade tables and the discount schedules mean. */
export function roundHalfUp(value, places = 0) {
  const shifted = scaledInteger(value, places);
  const rounded = shifted < 0 ? -Math.round(-shifted) : Math.round(shifted);
  return Number(`${rounded}e-${places}`);
}

/** Round half to even. Used only where an outside system asked for it. */
export function roundHalfEven(value, places = 0) {
  const shifted = scaledInteger(value, places);
  const floor = Math.floor(shifted);
  const diff = shifted - floor;
  let rounded;
  if (diff > 0.5) rounded = floor + 1;
  else if (diff < 0.5) rounded = floor;
  else rounded = floor % 2 === 0 ? floor : floor + 1;
  return Number(`${rounded}e-${places}`);
}

/** Chop toward zero. Bushels on a settlement sheet are truncated, never rounded up. */
export function truncate(value, places = 0) {
  const shifted = scaledInteger(value, places);
  const chopped = shifted < 0 ? Math.ceil(shifted) : Math.floor(shifted);
  return Number(`${chopped}e-${places}`);
}

/** Round to the nearest step, for things quoted in quarter cents or half tenths. */
export function roundToStep(value, step) {
  isFiniteNumber(value, 'value');
  if (step <= 0) {
    throw new ArithmeticError('BAD_STEP', `step must be positive, got ${step}`, { step });
  }
  const steps = roundHalfUp(value / step, 6);
  return roundHalfUp(Math.round(steps) * step, MAX_PLACES);
}

export function clamp(value, low, high) {
  isFiniteNumber(value, 'value');
  if (low > high) {
    throw new ArithmeticError('BAD_BOUNDS', `clamp bounds are inverted: ${low} > ${high}`, {
      low,
      high,
    });
  }
  return Math.min(high, Math.max(low, value));
}

/** Sum without letting the float error walk, which matters over a thousand tickets. */
export function sum(values, places = 4) {
  let total = 0;
  for (const value of values) {
    total += scaledInteger(isFiniteNumber(value, 'value'), places);
  }
  return Number(`${total}e-${places}`);
}

/** Percent of a whole, guarding the zero denominator the report code keeps hitting. */
export function percentOf(part, whole, places = 2) {
  isFiniteNumber(part, 'part');
  isFiniteNumber(whole, 'whole');
  if (whole === 0) return 0;
  return roundHalfUp((part / whole) * 100, places);
}

/** Compare two floats at the precision the caller actually cares about. */
export function sameToPlaces(a, b, places = 4) {
  return (
    scaledInteger(roundHalfUp(a, places), places) === scaledInteger(roundHalfUp(b, places), places)
  );
}
