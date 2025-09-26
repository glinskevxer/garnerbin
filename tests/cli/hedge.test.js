import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { runHedge } from '../../src/cli/hedge.js';

const example = (name) => fileURLToPath(new URL(`../../examples/${name}`, import.meta.url));

const base = {
  file: example('hedge-book-2025-11-14.json'),
  board: example('board-2025-10-09.csv'),
  day: '2025-10-09',
};

describe('marking the book', () => {
  const result = runHedge(base);

  it('prints a row for every open lot', () => {
    expect(result.rows).toHaveLength(5);
    expect(result.text).toContain('Hedge book at 2025-10-09');
    expect(result.text).toContain('H-101');
  });

  it('nets the months', () => {
    expect(result.text).toContain('ZCH26');
    expect(result.text).toContain('Net contracts short');
  });

  it('works out equity from cash and the mark', () => {
    expect(result.status.equityCents).toBe(42_000_000 + result.status.unrealisedCents);
  });

  it('posts a margin requirement against the open contracts', () => {
    expect(result.status.initialCents).toBeGreaterThan(result.status.maintenanceCents);
  });

  it('says where the account stands', () => {
    expect(result.text).toContain('Standing');
    expect(result.status.line).toMatch(/cushion of|call for/);
  });

  it('takes cash off the command line', () => {
    const thin = runHedge({ ...base, cash: '10000' });
    expect(thin.status.equityCents).toBeLessThan(result.status.equityCents);
    expect(thin.status.call.called).toBe(true);
  });

  it('narrows to one commodity', () => {
    expect(runHedge({ ...base, commodity: 'corn' }).rows).toHaveLength(3);
  });
});

describe('what it refuses', () => {
  it('refuses a file with no lots array', () => {
    expect(() => runHedge({ ...base, file: example('rush-creek.json') })).toThrow(
      /carries no lots/
    );
  });

  it('says so when nothing matches', () => {
    expect(() => runHedge({ ...base, commodity: 'sorghum' })).toThrow(/nothing in that book/);
  });

  it('says which month the board is missing', () => {
    expect(() => runHedge({ ...base, board: example('basis-2025-10-09.csv') })).toThrow();
  });
});
