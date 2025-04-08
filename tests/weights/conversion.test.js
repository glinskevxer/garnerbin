import { describe, expect, it } from 'vitest';
import { formatBushels } from '../../src/core/money.js';
import {
  explainWeights,
  houseKeeps,
  settlementWeights,
  weightSteps,
} from '../../src/weights/conversion.js';

describe('settlementWeights', () => {
  it('takes a dry clean load straight through', () => {
    const result = settlementWeights({ commodity: 'corn', netPounds: 50_400, moisture: 15 });
    expect(formatBushels(result.grossBushels)).toBe('900.00');
    expect(result.dockageBushels).toBe(0);
    expect(result.shrinkBushels).toBe(0);
    expect(formatBushels(result.netBushels)).toBe('900.00');
  });

  it('shrinks a wet load off the market moisture', () => {
    const result = settlementWeights({ commodity: 'corn', netPounds: 50_400, moisture: 18 });
    expect(result.moistureShrinkPercent).toBe(4.2);
    expect(formatBushels(result.shrinkBushels)).toBe('37.80');
    expect(formatBushels(result.netBushels)).toBe('862.20');
  });

  it('takes dockage before shrink, not after', () => {
    const result = settlementWeights({
      commodity: 'hrw',
      netPounds: 60_000,
      moisture: 15.5,
      dockagePercent: 2,
    });
    expect(formatBushels(result.grossBushels)).toBe('1,000.00');
    expect(formatBushels(result.dockageBushels)).toBe('20.00');
    expect(formatBushels(result.cleanBushels)).toBe('980.00');
    expect(formatBushels(result.shrinkBushels)).toBe('27.44');
    expect(formatBushels(result.netBushels)).toBe('952.56');
  });

  it('would come out heavier if shrink ran on the gross', () => {
    const result = settlementWeights({
      commodity: 'hrw',
      netPounds: 60_000,
      moisture: 15.5,
      dockagePercent: 2,
    });
    const wrongWay = Math.trunc(100_000 * 0.028);
    expect(result.shrinkBushels).toBeLessThan(wrongWay);
  });

  it('adds the handling percent on top of the moisture shrink', () => {
    const result = settlementWeights({
      commodity: 'corn',
      netPounds: 50_400,
      moisture: 18,
      handlingPercent: 0.5,
    });
    expect(result.shrinkPercent).toBe(4.7);
    expect(formatBushels(result.shrinkBushels)).toBe('42.30');
  });

  it('honours a house shrink factor other than the default', () => {
    const result = settlementWeights({
      commodity: 'corn',
      netPounds: 50_400,
      moisture: 18,
      shrinkFactor: 1.18,
    });
    expect(result.moistureShrinkPercent).toBe(3.54);
  });

  it('defaults the moisture to the market moisture when nobody read one', () => {
    const result = settlementWeights({ commodity: 'corn', netPounds: 50_400 });
    expect(result.moisture).toBe(15);
    expect(result.shrinkBushels).toBe(0);
  });

  it('refuses a commodity it does not take', () => {
    expect(() => settlementWeights({ commodity: 'oats', netPounds: 1000 })).toThrow(
      /must be one of/
    );
  });
});

describe('showing the work', () => {
  const wet = settlementWeights({
    commodity: 'hrw',
    netPounds: 60_000,
    moisture: 15.5,
    dockagePercent: 2,
  });

  it('lists the deductions in the order they happened', () => {
    expect(weightSteps(wet).map((step) => step.label)).toEqual([
      'Gross bushels',
      'Dockage at 2.0 percent',
      'Clean bushels',
      'Shrink at 2.80 percent',
      'Settlement bushels',
    ]);
  });

  it('drops the lines that took nothing', () => {
    const clean = settlementWeights({ commodity: 'corn', netPounds: 50_400, moisture: 15 });
    expect(weightSteps(clean).map((step) => step.label)).toEqual([
      'Gross bushels',
      'Clean bushels',
      'Settlement bushels',
    ]);
  });

  it('prints the lines in a column', () => {
    const text = explainWeights(wet);
    expect(text).toContain('Gross bushels                         1,000.00');
    expect(text).toContain('Settlement bushels                      952.56');
  });

  it('adds up what the house kept', () => {
    expect(houseKeeps(wet)).toBe(wet.grossBushels - wet.netBushels);
  });
});
