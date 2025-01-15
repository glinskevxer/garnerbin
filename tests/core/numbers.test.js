import { describe, expect, it } from 'vitest';
import {
  clamp,
  percentOf,
  roundHalfEven,
  roundHalfUp,
  roundToStep,
  sameToPlaces,
  scaledInteger,
  sum,
  truncate,
} from '../../src/core/numbers.js';

describe('roundHalfUp', () => {
  it('rounds the halves the float path gets wrong', () => {
    expect(roundHalfUp(2.675, 2)).toBe(2.68);
    expect(roundHalfUp(1.005, 2)).toBe(1.01);
    expect(roundHalfUp(8.165, 2)).toBe(8.17);
  });

  it('rounds away from zero on the negative side', () => {
    expect(roundHalfUp(-2.5)).toBe(-3);
    expect(roundHalfUp(-0.125, 2)).toBe(-0.13);
  });

  it('handles the moisture tenth the tables use', () => {
    expect(roundHalfUp(15.45, 1)).toBe(15.5);
    expect(roundHalfUp(15.44, 1)).toBe(15.4);
  });

  it('refuses more places than it can hold', () => {
    expect(() => roundHalfUp(1, 9)).toThrow(/decimal places/);
  });
});

describe('roundHalfEven', () => {
  it('sends the exact halves to the even neighbour', () => {
    expect(roundHalfEven(0.5)).toBe(0);
    expect(roundHalfEven(1.5)).toBe(2);
    expect(roundHalfEven(2.5)).toBe(2);
    expect(roundHalfEven(2.675, 2)).toBe(2.68);
  });

  it('leaves everything else alone', () => {
    expect(roundHalfEven(2.4)).toBe(2);
    expect(roundHalfEven(2.6)).toBe(3);
  });
});

describe('truncate', () => {
  it('chops toward zero', () => {
    expect(truncate(1234.999, 2)).toBe(1234.99);
    expect(truncate(-1234.999, 2)).toBe(-1234.99);
    expect(truncate(56.9)).toBe(56);
  });
});

describe('roundToStep', () => {
  it('snaps a bid to the quarter cent', () => {
    expect(roundToStep(4.6233, 0.0025)).toBe(4.6225);
    expect(roundToStep(4.6244, 0.0025)).toBe(4.625);
    expect(roundToStep(4.6212, 0.0025)).toBe(4.62);
  });

  it('refuses a step of zero', () => {
    expect(() => roundToStep(1, 0)).toThrow(/must be positive/);
  });
});

describe('clamp', () => {
  it('holds the value inside the bounds', () => {
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(-1, 0, 10)).toBe(0);
    expect(clamp(11, 0, 10)).toBe(10);
  });

  it('refuses inverted bounds', () => {
    expect(() => clamp(1, 10, 0)).toThrow(/inverted/);
  });
});

describe('sum', () => {
  it('adds a long column without drift', () => {
    const tenths = Array.from({ length: 1000 }, () => 0.1);
    expect(sum(tenths, 4)).toBe(100);
  });

  it('adds bushel hundredths exactly', () => {
    expect(sum([1234.56, 987.65, 0.01], 2)).toBe(2222.22);
  });
});

describe('percentOf', () => {
  it('reports a share to two places', () => {
    expect(percentOf(1, 3)).toBe(33.33);
    expect(percentOf(2, 3)).toBe(66.67);
  });

  it('answers zero rather than dividing by zero', () => {
    expect(percentOf(5, 0)).toBe(0);
  });
});

describe('scaledInteger and sameToPlaces', () => {
  it('scales the way the operator typed it', () => {
    expect(scaledInteger(1.005, 2)).toBe(100.5);
    expect(scaledInteger(15.4, 1)).toBe(154);
  });

  it('compares at the precision that matters', () => {
    expect(sameToPlaces(1.00001, 1.00002, 4)).toBe(true);
    expect(sameToPlaces(1.0001, 1.0002, 4)).toBe(false);
  });
});
