import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { formatMoney } from '../../src/core/money.js';
import { bidFor, runSettle, settlementCsv } from '../../src/cli/settle.js';

const example = (name) => fileURLToPath(new URL(`../../examples/${name}`, import.meta.url));

const base = {
  house: example('rush-creek.json'),
  tickets: example('tickets-2025-10-09.csv'),
  samples: example('samples-2025-10-09.csv'),
  bid: '4.2750',
  day: '2025-10-09',
};

let directory;

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'garnerbin-cli-'));
});

afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});

describe('working out the bid', () => {
  it('takes a bid given straight', () => {
    expect(bidFor({ bid: '4.2750' }, 'corn')).toBe(42_750);
  });

  it('works one out of the board and the basis', () => {
    expect(
      bidFor(
        {
          board: example('board-2025-10-09.csv'),
          basis: example('basis-2025-10-09.csv'),
          period: '2025-10',
          day: '2025-10-09',
        },
        'corn'
      )
    ).toBe(39_000);
  });

  it('refuses when it has neither', () => {
    expect(() => bidFor({}, 'corn')).toThrow(/give a bid, or a board and a basis/);
  });

  it('refuses a period the basis file does not quote', () => {
    expect(() =>
      bidFor(
        {
          board: example('board-2025-10-09.csv'),
          basis: example('basis-2025-10-09.csv'),
          period: '2027-01',
          day: '2025-10-09',
        },
        'corn'
      )
    ).toThrow(/does not quote corn for 2027-01/);
  });
});

describe('settling the day', () => {
  it('settles every inbound load and leaves the outbound one alone', () => {
    const result = runSettle(base);
    expect(result.settlements).toHaveLength(7);
    expect(result.text).toContain('Rush Creek Grain settlements');
    expect(result.text).toContain('T-10441');
    expect(result.text).not.toContain('T-10448');
  });

  it('foots the day', () => {
    const result = runSettle(base);
    expect(result.totals.loads).toBe(7);
    expect(result.totals.settled).toBeLessThan(result.totals.gross);
    expect(result.text).toContain('Paid out');
  });

  it('charges drying only on the wet loads', () => {
    const result = runSettle(base);
    const dry = result.settlements.find((entry) => entry.ticket === 'T-10444');
    const wet = result.settlements.find((entry) => entry.ticket === 'T-10446');
    expect(dry.drying.cents).toBe(0);
    expect(wet.drying.cents).toBeGreaterThan(0);
  });

  it('narrows to one commodity', () => {
    expect(runSettle({ ...base, commodity: 'soybeans' }).settlements).toHaveLength(1);
  });

  it('prints the whole statement for one ticket', () => {
    const result = runSettle({ ...base, ticket: 'T-10446' });
    expect(result.text).toContain('Rush Creek Grain settlement ST-T-10446');
    expect(result.text).toContain('Net due');
  });

  it('says so when nothing matches', () => {
    expect(() => runSettle({ ...base, ticket: 'T-99999' })).toThrow(/no inbound ticket/);
  });

  it('writes a csv when told to', async () => {
    const out = join(directory, 'settlements.csv');
    runSettle({ ...base, out });
    const csv = await readFile(out, 'utf8');
    expect(csv.split('\n')[0]).toContain('ticket,day,account,commodity,grade');
    expect(csv.split('\n')).toHaveLength(9);
  });

  it('writes the money ungrouped in the csv', () => {
    const csv = settlementCsv(runSettle(base).settlements);
    expect(csv).not.toMatch(/,\d+,\d{3}\.\d\d/);
  });

  it('refuses a ticket file with rows it could not build', () => {
    expect(() => runSettle({ ...base, tickets: example('rush-creek.json') })).toThrow();
  });
});

describe('what the totals mean', () => {
  it('pays out less than the gross bushels at the bid', () => {
    const result = runSettle(base);
    const atGross = (result.totals.gross * 42_750) / 10_000;
    expect(result.totals.net).toBeLessThan(atGross);
    expect(formatMoney(result.totals.net)).toMatch(/^\d/);
  });
});
