import { describe, expect, it } from 'vitest';
import {
  ArithmeticError,
  ConfigError,
  GarnerbinError,
  GradeError,
  isGarnerbinError,
  isTransient,
  reviveError,
} from '../../src/core/errors.js';

describe('GarnerbinError', () => {
  it('keeps the code and freezes the details', () => {
    const err = new ConfigError('BAD_SCHEDULE', 'discount schedule has no bands', {
      file: 'schedules/2025.json',
    });
    expect(err.code).toBe('BAD_SCHEDULE');
    expect(err.name).toBe('ConfigError');
    expect(err.details.file).toBe('schedules/2025.json');
    expect(Object.isFrozen(err.details)).toBe(true);
  });

  it('refuses a code that is not screaming snake case', () => {
    expect(() => new GarnerbinError('badCode', 'nope')).toThrow(/screaming snake case/);
    expect(() => new GarnerbinError('BAD-CODE', 'nope')).toThrow(/screaming snake case/);
    expect(() => new GarnerbinError('_LEADING', 'nope')).toThrow(/screaming snake case/);
  });

  it('accepts digits inside a segment', () => {
    const err = new GradeError('US_NO_2_ONLY', 'contract takes no 3 corn');
    expect(err.code).toBe('US_NO_2_ONLY');
  });

  it('prints one line for the scale house', () => {
    const err = new GradeError('NO_TABLE', 'no table for triticale');
    expect(err.toLine()).toBe('NO_TABLE: no table for triticale');
  });

  it('survives a round trip through JSON', () => {
    const original = new ArithmeticError('MILL_OVERFLOW', 'price is past the board limit', {
      mills: 99_999_999,
    });
    const revived = reviveError(JSON.parse(JSON.stringify(original)));
    expect(revived).toBeInstanceOf(ArithmeticError);
    expect(revived.code).toBe('MILL_OVERFLOW');
    expect(revived.details.mills).toBe(99_999_999);
  });

  it('falls back to the base class for a name it does not know', () => {
    const revived = reviveError({ name: 'SomethingElse', code: 'X_Y', message: 'hm' });
    expect(revived).toBeInstanceOf(GarnerbinError);
    expect(revived.name).toBe('GarnerbinError');
  });

  it('rejects a payload that is not an object', () => {
    expect(() => reviveError('nope')).toThrow(TypeError);
    expect(() => reviveError(null)).toThrow(TypeError);
  });

  it('recognises its own errors and nobody else', () => {
    expect(isGarnerbinError(new ConfigError('A', 'a'))).toBe(true);
    expect(isGarnerbinError(new Error('a'))).toBe(false);
  });

  it('marks an error transient only when the details say so', () => {
    expect(isTransient(new ConfigError('A', 'a', { transient: true }))).toBe(true);
    expect(isTransient(new ConfigError('A', 'a'))).toBe(false);
    expect(isTransient(new Error('a'))).toBe(false);
  });
});
