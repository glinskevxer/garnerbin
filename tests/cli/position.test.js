import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { formatBushels } from '../../src/core/money.js';
import { runPosition } from '../../src/cli/position.js';

const example = (name) => fileURLToPath(new URL(`../../examples/${name}`, import.meta.url));

const base = { file: example('position-2025-11-14.json') };

describe('the position report', () => {
  const result = runPosition(base);

  it('reads every commodity on the file', () => {
    expect(result.report.rows).toHaveLength(3);
    expect(result.report.rows.map((row) => row.commodity)).toEqual(['corn', 'soybeans', 'hrw']);
  });

  it('takes the day off the file', () => {
    expect(result.report.day).toBe('2025-11-14');
  });

  it('works the unhedged column out for each grain', () => {
    const corn = result.report.positions.find((entry) => entry.commodity === 'corn');
    expect(formatBushels(corn.houseOwned)).toBe('874,000.00');
    expect(formatBushels(corn.unhedgedBushels)).toBe('99,000.00');
  });

  it('names the house from the house file when it is given', () => {
    const named = runPosition({ ...base, house: example('rush-creek.json') });
    expect(named.report.house).toBe('Rush Creek Grain');
    expect(named.text).toContain('Rush Creek Grain daily position');
  });

  it('narrows to one commodity', () => {
    expect(runPosition({ ...base, commodity: 'hrw' }).report.rows).toHaveLength(1);
  });

  it('says so when nothing matches', () => {
    expect(() => runPosition({ ...base, commodity: 'sorghum' })).toThrow(/nothing in that file/);
  });

  it('refuses a file with no positions array', () => {
    expect(() => runPosition({ file: example('rush-creek.json') })).toThrow(/carries no positions/);
  });
});

describe('the covenant', () => {
  it('says nothing about it when no limit was given', () => {
    expect(runPosition(base).over).toBe(false);
    expect(runPosition(base).text).not.toContain('covenant');
  });

  it('reports inside the covenant when the house is square enough', () => {
    const result = runPosition({ ...base, limit: '5000000' });
    expect(result.over).toBe(false);
    expect(result.text).toContain('Inside the covenant');
  });

  it('shouts when the house is past it', () => {
    const result = runPosition({ ...base, limit: '1000' });
    expect(result.over).toBe(true);
    expect(result.text).toContain('OVER THE COVENANT');
  });
});
