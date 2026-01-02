import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifyJournal } from '../../src/audit/journal.js';
import { runClose } from '../../src/cli/close.js';

const example = (name) => fileURLToPath(new URL(`../../examples/${name}`, import.meta.url));

const base = {
  house: example('rush-creek.json'),
  tickets: example('tickets-2025-10-09.csv'),
  samples: example('samples-2025-10-09.csv'),
  bid: '4.2750',
};

let directory;

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'garnerbin-close-'));
});

afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});

describe('closing the worked day', () => {
  const result = runClose(base);

  it('settles every inbound load', () => {
    expect(result.close.register.totals.unsettled).toBe(1);
    expect(result.close.foots).toBe(false);
  });

  it('splits the day by commodity', () => {
    expect(Object.keys(result.close.byCommodity).sort()).toEqual(['corn', 'soybeans']);
    expect(result.close.byCommodity.corn.loads).toBe(7);
  });

  it('seals the day', () => {
    expect(result.close.seal).toMatch(/^[0-9a-f]{64}$/);
    expect(verifyJournal(result.close.journal).ok).toBe(true);
  });

  it('says what is still open', () => {
    expect(result.attention).toContain('1 tickets are not settled');
    expect(result.text).toContain('Before this day is closed');
  });

  it('leaves the reconciliation out when nothing was measured', () => {
    expect(result.close.reconciliation).toBeNull();
  });
});

describe('with a measurement', () => {
  it('foots when the bins agree', () => {
    const result = runClose({ ...base, measured: '1948.56' });
    expect(result.close.reconciliation.direction).toBe('flat');
    expect(result.close.inTolerance).toBe(true);
  });

  it('says so when they do not', () => {
    const result = runClose({ ...base, measured: '6000' });
    expect(result.close.inTolerance).toBe(false);
    expect(result.attention.some((reason) => reason.includes('over'))).toBe(true);
  });

  it('carries an opening balance in', () => {
    const result = runClose({ ...base, opening: '1000', measured: '2948.56' });
    expect(result.close.reconciliation.opening).toBe(100_000);
    expect(result.close.reconciliation.direction).toBe('flat');
  });
});

describe('without settling', () => {
  it('closes on the weights alone', () => {
    const result = runClose({ house: base.house, tickets: base.tickets });
    expect(result.close.register.totals.netCents).toBe(0);
    expect(result.close.byCommodity.corn.received).toBeGreaterThan(0);
  });
});

describe('writing the journal out', () => {
  it('writes a journal that verifies', async () => {
    const out = join(directory, 'close.json');
    runClose({ ...base, out });
    const journal = JSON.parse(await readFile(out, 'utf8'));
    expect(verifyJournal(journal).ok).toBe(true);
    expect(journal.entries).toHaveLength(8);
  });
});
