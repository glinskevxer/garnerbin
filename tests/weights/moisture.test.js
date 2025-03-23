import { describe, expect, it } from 'vitest';
import {
  AIR_OVEN_TOLERANCE,
  assertReadable,
  correctedMoisture,
  meterCeiling,
  meterCheck,
  overMeterCeiling,
  temperatureCorrection,
  waterPounds,
  weightedMoisture,
} from '../../src/weights/moisture.js';

describe('temperature correction', () => {
  it('leaves the comfortable range alone', () => {
    expect(temperatureCorrection(40)).toBe(0);
    expect(temperatureCorrection(65)).toBe(0);
    expect(temperatureCorrection(90)).toBe(0);
  });

  it('adds a tenth for every ten degrees of cold', () => {
    expect(temperatureCorrection(39)).toBe(0.1);
    expect(temperatureCorrection(30)).toBe(0.1);
    expect(temperatureCorrection(29)).toBe(0.2);
    expect(temperatureCorrection(10)).toBe(0.3);
  });

  it('takes a tenth off for heat', () => {
    expect(temperatureCorrection(91)).toBe(-0.1);
    expect(temperatureCorrection(105)).toBe(-0.2);
  });

  it('refuses a temperature nobody could have measured', () => {
    expect(() => temperatureCorrection(200)).toThrow(/between -20 and 140/);
  });
});

describe('correctedMoisture', () => {
  it('applies the temperature correction to the reading', () => {
    expect(correctedMoisture('corn', 15.4, { grainTempF: 35 })).toBe(15.5);
    expect(correctedMoisture('corn', 15.4, { grainTempF: 65 })).toBe(15.4);
  });

  it('applies a meter bias on top', () => {
    expect(correctedMoisture('corn', 15.4, { grainTempF: 65, meterBias: -0.2 })).toBe(15.2);
  });

  it('takes the raw reading when no temperature was recorded', () => {
    expect(correctedMoisture('corn', 18.62)).toBe(18.6);
  });
});

describe('the meter ceiling', () => {
  it('sits higher for corn than for beans', () => {
    expect(meterCeiling('corn')).toBe(35);
    expect(meterCeiling('soybeans')).toBe(25);
  });

  it('flags a reading over the ceiling', () => {
    expect(overMeterCeiling('soybeans', 26)).toBe(true);
    expect(overMeterCeiling('soybeans', 25)).toBe(false);
    expect(assertReadable('corn', 24)).toBe(24);
  });

  it('refuses to record a reading the meter cannot stand behind', () => {
    expect(() => assertReadable('soybeans', 30)).toThrow(/over the soybeans meter ceiling of 25/);
  });
});

describe('the daily oven check', () => {
  it('passes a meter inside half a point', () => {
    const check = meterCheck({ meterReading: 15.2, ovenReading: 15.6 });
    expect(check.difference).toBe(-0.4);
    expect(check.withinTolerance).toBe(true);
    expect(AIR_OVEN_TOLERANCE).toBe(0.5);
  });

  it('fails a meter that has drifted', () => {
    const check = meterCheck({ meterReading: 16.4, ovenReading: 15.6 });
    expect(check.withinTolerance).toBe(false);
    expect(check.suggestedBias).toBe(-0.8);
  });

  it('sits right on the line at half a point', () => {
    expect(meterCheck({ meterReading: 15.1, ovenReading: 15.6 }).withinTolerance).toBe(true);
  });
});

describe('weighted moisture', () => {
  it('weights each reading by its bushels', () => {
    expect(
      weightedMoisture([
        { bushels: 9000, moisture: 15 },
        { bushels: 1000, moisture: 25 },
      ])
    ).toBe(16);
  });

  it('is not the straight average', () => {
    const entries = [
      { bushels: 9000, moisture: 15 },
      { bushels: 1000, moisture: 25 },
    ];
    expect(weightedMoisture(entries)).not.toBe(20);
  });

  it('answers zero when nothing came in', () => {
    expect(weightedMoisture([{ bushels: 0, moisture: 15 }])).toBe(0);
  });

  it('refuses an empty list', () => {
    expect(() => weightedMoisture([])).toThrow(/at least 1/);
  });
});

describe('water in the load', () => {
  it('gives the pounds the dryer has to move', () => {
    expect(waterPounds(50_000, 20)).toBe(10_000);
    expect(waterPounds(0, 20)).toBe(0);
  });
});
