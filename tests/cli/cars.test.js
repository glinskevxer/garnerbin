import { describe, expect, it } from 'vitest';
import { runCars } from '../../src/cli/cars.js';

const base = { bushels: '400000', commodity: 'corn', car: 'hopper4750' };

describe('planning cars', () => {
  it('says how many cars and what binds', () => {
    const result = runCars(base);
    expect(result.plan.binding).toBe('volume');
    expect(result.plan.cars).toBe(105);
    expect(result.text).toContain('Loading 400,000.00 bushels of corn');
    expect(result.text).toContain('Limited by  volume');
  });

  it('lets the weight bind on beans', () => {
    expect(runCars({ ...base, commodity: 'soybeans' }).plan.binding).toBe('weight');
  });

  it('takes a real tare weight', () => {
    const heavy = runCars({ ...base, tare: '70000' });
    const light = runCars({ ...base, tare: '60000' });
    expect(heavy.plan.byWeight).toBeLessThan(light.plan.byWeight);
  });

  it('takes a lower gross rail load', () => {
    const derated = runCars({ ...base, gross: '263000' });
    expect(derated.plan.binding).toBe('weight');
    expect(derated.plan.cars).toBeGreaterThan(runCars(base).plan.cars);
  });

  it('compares every car on the line', () => {
    const result = runCars(base);
    expect(result.comparison).toHaveLength(3);
    expect(result.text).toContain('hopper5200');
  });

  it('needs fewer of the bigger car', () => {
    const result = runCars(base);
    const small = result.comparison.find((row) => row.car === 'hopper4650');
    const big = result.comparison.find((row) => row.car === 'hopper5200');
    expect(big.cars).toBeLessThan(small.cars);
  });
});

describe('the train', () => {
  it('makes the shuttle when there are enough cars', () => {
    const result = runCars({ ...base, bushels: '450000' });
    expect(result.train.qualifies).toBe(true);
    expect(result.text).toContain('makes the 110 car rate');
  });

  it('says how short a smaller shipment is', () => {
    const result = runCars(base);
    expect(result.train.qualifies).toBe(false);
    expect(result.train.carsShort).toBe(5);
    expect(result.text).toContain('cars short of 110');
  });

  it('takes a shorter string when the rate is a unit train', () => {
    expect(runCars({ ...base, bushels: '300000', train: '75' }).train.qualifies).toBe(true);
  });
});

describe('what it refuses', () => {
  it('refuses a grain the house does not take', () => {
    expect(() => runCars({ ...base, commodity: 'oats' })).toThrow(/must be one of/);
  });

  it('refuses a car it does not know', () => {
    expect(() => runCars({ ...base, car: 'boxcar' })).toThrow(/must be one of/);
  });

  it('refuses a shipment of nothing', () => {
    expect(() => runCars({ ...base, bushels: '0' })).toThrow(/greater than zero/);
  });
});
