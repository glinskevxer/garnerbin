import { describe, expect, it } from 'vitest';
import {
  aerationAdvice,
  allowableStorageDays,
  COOLING_STEP_F,
  COOLING_TARGET_F,
  coolingPlan,
  equilibriumMoisture,
  frontHours,
  humidityFor,
} from '../../src/inventory/aeration.js';

describe('equilibrium moisture', () => {
  it('puts corn near twelve and a half at sixty degrees and sixty five percent', () => {
    expect(equilibriumMoisture('corn', 60, 0.65)).toBeCloseTo(12.5, 1);
  });

  it('reads wheat higher and beans lower than corn on the same air', () => {
    expect(equilibriumMoisture('hrw', 60, 0.65)).toBeGreaterThan(
      equilibriumMoisture('corn', 60, 0.65)
    );
    expect(equilibriumMoisture('soybeans', 60, 0.65)).toBeLessThan(
      equilibriumMoisture('corn', 60, 0.65)
    );
  });

  it('rises with humidity and falls with temperature', () => {
    expect(equilibriumMoisture('corn', 60, 0.8)).toBeGreaterThan(
      equilibriumMoisture('corn', 60, 0.6)
    );
    expect(equilibriumMoisture('corn', 40, 0.65)).toBeGreaterThan(
      equilibriumMoisture('corn', 80, 0.65)
    );
  });

  it('refuses a humidity outside the range the equation holds in', () => {
    expect(() => equilibriumMoisture('corn', 60, 1)).toThrow(/between 0.01 and 0.99/);
    expect(() => equilibriumMoisture('corn', 60, 0)).toThrow(/between 0.01 and 0.99/);
  });

  it('goes back the other way', () => {
    const rh = humidityFor('corn', 60, equilibriumMoisture('corn', 60, 0.65));
    expect(rh).toBeCloseTo(0.65, 2);
  });
});

describe('whether to run the fan', () => {
  const base = {
    commodity: 'corn',
    grainMoisture: 15,
    grainTempF: 70,
    airTempF: 55,
    relativeHumidity: 0.55,
  };

  it('cools when the air is ten degrees under the grain', () => {
    const advice = aerationAdvice(base);
    expect(advice.run).toBe(true);
    expect(advice.reason).toContain('cooling from 70');
  });

  it('will not run on air that would put moisture back', () => {
    const advice = aerationAdvice({ ...base, relativeHumidity: 0.9, grainMoisture: 13 });
    expect(advice.run).toBe(false);
    expect(advice.reason).toContain('would put moisture back');
  });

  it('holds when the air is not cold enough to move the front', () => {
    const advice = aerationAdvice({ ...base, grainMoisture: 13.5, airTempF: 68 });
    expect(advice.run).toBe(false);
    expect(advice.reason).toContain('not cold enough');
  });

  it('dries a wet bin that is already cold', () => {
    const advice = aerationAdvice({
      ...base,
      grainMoisture: 16.5,
      grainTempF: 38,
      airTempF: 38,
      relativeHumidity: 0.5,
    });
    expect(advice.run).toBe(true);
    expect(advice.reason).toContain('drying toward');
  });

  it('leaves a cold dry bin alone', () => {
    const advice = aerationAdvice({
      ...base,
      grainMoisture: 14,
      grainTempF: 38,
      airTempF: 36,
      relativeHumidity: 0.6,
    });
    expect(advice.run).toBe(false);
    expect(advice.reason).toContain('already where it should be');
  });

  it('takes a target other than forty', () => {
    const advice = aerationAdvice({ ...base, grainTempF: 45, airTempF: 33, targetTempF: 30 });
    expect(advice.run).toBe(true);
  });
});

describe('allowable storage time', () => {
  it('shortens sharply with moisture', () => {
    const dry = allowableStorageDays('corn', 15, 40);
    const wet = allowableStorageDays('corn', 20, 40);
    expect(wet).toBeLessThan(dry / 3);
  });

  it('shortens with temperature', () => {
    expect(allowableStorageDays('corn', 15, 60)).toBeLessThan(allowableStorageDays('corn', 15, 40));
  });

  it('gives a long life to cold dry corn', () => {
    expect(allowableStorageDays('corn', 14, 30)).toBeGreaterThan(400);
  });

  it('refuses a reading off the chart', () => {
    expect(() => allowableStorageDays('corn', 5, 40)).toThrow(/between 10 and 45/);
    expect(() => allowableStorageDays('corn', 15, 150)).toThrow(/between 20 and 120/);
  });
});

describe('the cooling plan', () => {
  it('steps down ten degrees at a time to the target', () => {
    expect(COOLING_STEP_F).toBe(10);
    expect(COOLING_TARGET_F).toBe(40);
    expect(coolingPlan('corn', 75)).toEqual([65, 55, 45, 40]);
  });

  it('is one step when the bin is nearly there', () => {
    expect(coolingPlan('corn', 45)).toEqual([40]);
  });

  it('is empty when the bin is already colder than the target', () => {
    expect(coolingPlan('corn', 35)).toEqual([]);
  });

  it('turns a fan rate into hours for a front', () => {
    expect(frontHours(0.1)).toBe(15);
    expect(frontHours(0.5)).toBe(3);
    expect(() => frontHours(0)).toThrow(/greater than zero/);
  });
});
