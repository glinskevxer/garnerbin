import { describe, expect, it } from 'vitest';
import * as guard from '../../src/core/assert.js';

function codeOf(fn) {
  try {
    fn();
  } catch (err) {
    return err.code;
  }
  return null;
}

describe('guards', () => {
  it('returns the value it was handed', () => {
    expect(guard.isString('corn', 'commodity')).toBe('corn');
    expect(guard.isInteger(56, 'testWeight')).toBe(56);
    expect(guard.isArray([1], 'bins')).toEqual([1]);
  });

  it('names the field in the message', () => {
    expect(() => guard.required(undefined, 'ticketNumber')).toThrow('ticketNumber is required');
  });

  it('codes each failure separately', () => {
    expect(codeOf(() => guard.required(null, 'x'))).toBe('MISSING_VALUE');
    expect(codeOf(() => guard.isString(7, 'x'))).toBe('NOT_A_STRING');
    expect(codeOf(() => guard.isString('  ', 'x'))).toBe('EMPTY_STRING');
    expect(codeOf(() => guard.isFiniteNumber(Number.NaN, 'x'))).toBe('NOT_A_NUMBER');
    expect(codeOf(() => guard.isFiniteNumber(Infinity, 'x'))).toBe('NOT_A_NUMBER');
    expect(codeOf(() => guard.isInteger(1.5, 'x'))).toBe('NOT_AN_INTEGER');
    expect(codeOf(() => guard.inRange(11, 'x', 0, 10))).toBe('OUT_OF_RANGE');
    expect(codeOf(() => guard.nonNegative(-1, 'x'))).toBe('NEGATIVE_VALUE');
    expect(codeOf(() => guard.positive(0, 'x'))).toBe('NOT_POSITIVE');
    expect(codeOf(() => guard.isArray('no', 'x'))).toBe('NOT_AN_ARRAY');
    expect(codeOf(() => guard.isArray([], 'x', { minLength: 1 }))).toBe('ARRAY_TOO_SHORT');
    expect(codeOf(() => guard.isPlainObject([], 'x'))).toBe('NOT_AN_OBJECT');
    expect(codeOf(() => guard.oneOf('rye', 'x', ['corn', 'beans']))).toBe('NOT_ALLOWED');
  });

  it('allows an empty string when told to', () => {
    expect(guard.isString('', 'note', { allowEmpty: true })).toBe('');
  });

  it('treats the range ends as inside the range', () => {
    expect(guard.inRange(0, 'x', 0, 10)).toBe(0);
    expect(guard.inRange(10, 'x', 0, 10)).toBe(10);
  });

  it('lets zero through nonNegative but not through positive', () => {
    expect(guard.nonNegative(0, 'x')).toBe(0);
    expect(() => guard.positive(0, 'x')).toThrow(/greater than zero/);
  });

  it('carries the offending value in the details', () => {
    try {
      guard.inRange(31.2, 'moisture', 0, 30);
    } catch (err) {
      expect(err.details).toEqual({ field: 'moisture', low: 0, high: 30, value: 31.2 });
    }
  });
});
