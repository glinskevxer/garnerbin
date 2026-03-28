import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { runQueue } from '../../src/cli/queue.js';

const example = (name) => fileURLToPath(new URL(`../../examples/${name}`, import.meta.url));
const base = { file: example('arrivals-2025-10-09.json') };

describe('running the day through the pit', () => {
  const result = runQueue(base);

  it('serves every truck on the file', () => {
    expect(result.day.loads).toBe(10);
    expect(result.day.rows).toHaveLength(10);
  });

  it('backs the line up on a busy morning', () => {
    expect(result.day.longestWait).toBeGreaterThan(0);
    expect(result.day.meanWait).toBeGreaterThan(0);
  });

  it('reads the pit off the file', () => {
    expect(result.pit.pits).toBe(1);
    expect(result.pit.unloadBushelsPerHour).toBe(6000);
    expect(result.pit.dryerBushelsPerHour).toBe(4500);
  });

  it('says the dryer is the thing in the way', () => {
    expect(result.advice.limitedBy).toBe('the dryer');
    expect(result.advice.worthIt).toBe(false);
    expect(result.text).toContain('limited by the dryer');
  });

  it('prints the trucks and the totals', () => {
    expect(result.text).toContain('The pit on 2025-10-09');
    expect(result.text).toContain('T-10441');
    expect(result.text).toContain('Longest wait');
  });
});

describe('overriding the pit', () => {
  it('opens a second pit', () => {
    const wider = runQueue({ ...base, pits: '2' });
    expect(wider.pit.pits).toBe(2);
    expect(wider.day.longestWait).toBeLessThan(runQueue(base).day.longestWait);
  });

  it('takes a faster leg', () => {
    const faster = runQueue({ ...base, rate: '12000' });
    expect(faster.day.longestWait).toBeLessThan(runQueue(base).day.longestWait);
  });
});

describe('what it refuses', () => {
  it('refuses a file with no arrivals array', () => {
    expect(() => runQueue({ file: example('rush-creek.json') })).toThrow(/carries no arrivals/);
  });

  it('says which file is missing', () => {
    expect(() => runQueue({ file: example('nowhere.json') })).toThrow(/no arrivals file at/);
  });
});
