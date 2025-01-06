import { GarnerbinError } from './errors.js';

/**
 * Guards. Every one of these throws a coded error rather than a bare TypeError,
 * so a bad import file reads the same way in the log as a bad command line.
 */

function fail(code, message, details) {
  throw new GarnerbinError(code, message, details);
}

export function required(value, name) {
  if (value === undefined || value === null) {
    fail('MISSING_VALUE', `${name} is required`, { field: name });
  }
  return value;
}

export function isString(value, name, { allowEmpty = false } = {}) {
  required(value, name);
  if (typeof value !== 'string') {
    fail('NOT_A_STRING', `${name} must be a string, got ${typeof value}`, { field: name });
  }
  if (!allowEmpty && value.trim() === '') {
    fail('EMPTY_STRING', `${name} must not be blank`, { field: name });
  }
  return value;
}

export function isFiniteNumber(value, name) {
  required(value, name);
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    fail('NOT_A_NUMBER', `${name} must be a finite number, got ${String(value)}`, { field: name });
  }
  return value;
}

export function isInteger(value, name) {
  isFiniteNumber(value, name);
  if (!Number.isInteger(value)) {
    fail('NOT_AN_INTEGER', `${name} must be a whole number, got ${value}`, { field: name });
  }
  return value;
}

export function inRange(value, name, low, high) {
  isFiniteNumber(value, name);
  if (value < low || value > high) {
    fail('OUT_OF_RANGE', `${name} must be between ${low} and ${high}, got ${value}`, {
      field: name,
      low,
      high,
      value,
    });
  }
  return value;
}

export function nonNegative(value, name) {
  isFiniteNumber(value, name);
  if (value < 0) {
    fail('NEGATIVE_VALUE', `${name} must not be negative, got ${value}`, { field: name, value });
  }
  return value;
}

export function positive(value, name) {
  isFiniteNumber(value, name);
  if (value <= 0) {
    fail('NOT_POSITIVE', `${name} must be greater than zero, got ${value}`, { field: name, value });
  }
  return value;
}

export function isArray(value, name, { minLength = 0 } = {}) {
  required(value, name);
  if (!Array.isArray(value)) {
    fail('NOT_AN_ARRAY', `${name} must be an array`, { field: name });
  }
  if (value.length < minLength) {
    fail('ARRAY_TOO_SHORT', `${name} needs at least ${minLength} entries, got ${value.length}`, {
      field: name,
      minLength,
    });
  }
  return value;
}

export function isPlainObject(value, name) {
  required(value, name);
  if (typeof value !== 'object' || Array.isArray(value)) {
    fail('NOT_AN_OBJECT', `${name} must be an object`, { field: name });
  }
  return value;
}

export function oneOf(value, name, allowed) {
  required(value, name);
  if (!allowed.includes(value)) {
    fail('NOT_ALLOWED', `${name} must be one of ${allowed.join(', ')}, got ${String(value)}`, {
      field: name,
      allowed,
      value,
    });
  }
  return value;
}
