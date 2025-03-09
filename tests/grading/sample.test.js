import { describe, expect, it } from 'vitest';
import {
  compositeSample,
  createSample,
  isCountField,
  isFlagField,
  isReadingField,
  readingsOf,
} from '../../src/grading/sample.js';

const base = {
  id: 'P-1',
  commodity: 'corn',
  day: '2025-10-04',
  grams: 1000,
  testWeight: 55.4,
  damagedTotal: 2.1,
  heatDamaged: 0,
  bcfm: 1.8,
  moisture: 16.4,
};

describe('createSample', () => {
  it('keeps the readings and freezes the record', () => {
    const sample = createSample(base);
    expect(sample.testWeight).toBe(55.4);
    expect(sample.grader).toBeNull();
    expect(Object.isFrozen(sample)).toBe(true);
  });

  it('defaults the sample to a thousand grams', () => {
    const { grams: _grams, ...withoutGrams } = base;
    expect(createSample(withoutGrams).grams).toBe(1000);
  });

  it('rounds a reading to the places its factor reports', () => {
    expect(createSample({ ...base, testWeight: 55.44 }).testWeight).toBe(55.4);
    expect(createSample({ ...base, moisture: 16.449 }).moisture).toBe(16.4);
  });

  it('refuses a reading outside the meter range', () => {
    expect(() => createSample({ ...base, moisture: 48 })).toThrow(/between 0 and 45/);
    expect(() => createSample({ ...base, testWeight: 12 })).toThrow(/between 30 and 70/);
  });

  it('refuses a field nobody put on a sample', () => {
    expect(() => createSample({ ...base, colour: 'yellow' })).toThrow(/nothing on a sample/);
  });

  it('refuses a flag that is not a boolean', () => {
    expect(() => createSample({ ...base, heating: 'yes' })).toThrow(/must be true or false/);
    expect(createSample({ ...base, heating: false }).heating).toBe(false);
  });

  it('refuses a day and a commodity it cannot read', () => {
    expect(() => createSample({ ...base, day: '10/04/2025' })).toThrow(/YYYY-MM-DD/);
    expect(() => createSample({ ...base, commodity: 'oats' })).toThrow(/must be one of/);
  });

  it('sorts fields into readings, counts and flags', () => {
    expect(isReadingField('testWeight')).toBe(true);
    expect(isCountField('liveWeevils')).toBe(true);
    expect(isFlagField('musty')).toBe(true);
    expect(isReadingField('musty')).toBe(false);
  });

  it('pulls just the readings back out', () => {
    const sample = createSample({ ...base, liveWeevils: 1, heating: false });
    expect(readingsOf(sample)).toEqual({
      testWeight: 55.4,
      damagedTotal: 2.1,
      heatDamaged: 0,
      bcfm: 1.8,
      moisture: 16.4,
    });
  });
});

describe('compositeSample', () => {
  const heavy = createSample({ ...base, id: 'P-1', grams: 1500, testWeight: 56, moisture: 15 });
  const light = createSample({ ...base, id: 'P-2', grams: 500, testWeight: 52, moisture: 19 });

  it('weights the readings by the grams behind them', () => {
    const composite = compositeSample([heavy, light]);
    expect(composite.testWeight).toBe(55);
    expect(composite.moisture).toBe(16);
    expect(composite.grams).toBe(2000);
  });

  it('takes the earliest day and names itself off the first probe', () => {
    const later = createSample({ ...base, id: 'P-3', day: '2025-10-05' });
    const composite = compositeSample([later, heavy]);
    expect(composite.day).toBe('2025-10-04');
    expect(composite.id).toBe('P-3-composite');
    expect(compositeSample([heavy], { id: 'C-9' }).id).toBe('C-9');
  });

  it('adds the counts and carries any flag that was set anywhere', () => {
    const buggy = createSample({ ...base, id: 'P-4', liveWeevils: 2, musty: true });
    const clean = createSample({ ...base, id: 'P-5', liveWeevils: 1 });
    const composite = compositeSample([buggy, clean]);
    expect(composite.liveWeevils).toBe(3);
    expect(composite.musty).toBe(true);
  });

  it('skips a reading no probe reported', () => {
    const composite = compositeSample([heavy, light]);
    expect(composite.protein).toBeUndefined();
  });

  it('refuses to mix commodities', () => {
    const beans = createSample({ ...base, id: 'P-6', commodity: 'soybeans' });
    expect(() => compositeSample([heavy, beans])).toThrow(/cannot mix commodities/);
  });

  it('refuses an empty list', () => {
    expect(() => compositeSample([])).toThrow(/at least 1/);
  });
});
