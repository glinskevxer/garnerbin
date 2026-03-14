import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runRegister } from '../../src/cli/register.js';

const example = (name) => fileURLToPath(new URL(`../../examples/${name}`, import.meta.url));

const base = {
  house: example('rush-creek.json'),
  tickets: example('tickets-2025-10-09.csv'),
};

let directory;

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'garnerbin-register-'));
});

afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});

describe('the register without settlements', () => {
  const result = runRegister(base);

  it('prints every ticket on the day', () => {
    expect(result.register.rows).toHaveLength(8);
    expect(result.text).toContain('Rush Creek Grain ticket register 2025-10-09');
  });

  it('takes the day off the first ticket when nobody gave one', () => {
    expect(result.register.day).toBe('2025-10-09');
  });

  it('leaves the money columns empty', () => {
    expect(result.register.totals.netCents).toBe(0);
    expect(result.register.totals.unsettled).toBe(7);
  });

  it('separates the outbound car', () => {
    expect(result.register.totals.outbound).toBe(1);
    expect(result.register.totals.inbound).toBe(7);
  });
});

describe('the register with settlements', () => {
  const result = runRegister({
    ...base,
    samples: example('samples-2025-10-09.csv'),
    bid: '4.2750',
  });

  it('settles as it goes', () => {
    expect(result.register.totals.unsettled).toBe(0);
    expect(result.register.totals.netCents).toBeGreaterThan(0);
  });

  it('foots the settlement bushels below the gross', () => {
    expect(result.register.totals.settlementBushels).toBeLessThan(
      result.register.totals.grossBushels
    );
  });

  it('works from a board and a basis instead of a bid', () => {
    const fromBoard = runRegister({
      ...base,
      samples: example('samples-2025-10-09.csv'),
      board: example('board-2025-10-09.csv'),
      basis: example('basis-2025-10-09.csv'),
      period: '2025-10',
      day: '2025-10-09',
    });
    const cornAtBoard = fromBoard.register.rows.find((row) => row.ticket === 'T-10441');
    const cornAtBid = result.register.rows.find((row) => row.ticket === 'T-10441');
    expect(cornAtBoard.netCents).toBeLessThan(cornAtBid.netCents);
  });
});

describe('picking a day', () => {
  it('prints nothing for a day with no tickets', () => {
    const result = runRegister({ ...base, day: '2025-10-10' });
    expect(result.register.rows).toEqual([]);
    expect(result.register.totals.tickets).toBe(0);
  });
});

describe('writing it out', () => {
  it('writes a csv when told to', async () => {
    const out = join(directory, 'register.csv');
    runRegister({ ...base, out });
    const csv = await readFile(out, 'utf8');
    expect(csv.split('\n')[0]).toBe(
      'ticket,day,direction,account,commodity,netPounds,grossBushels,settlementBushels,grade,net'
    );
  });
});
