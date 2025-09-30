import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifyJournal } from '../../src/audit/journal.js';
import { runBook } from '../../src/cli/book.js';

const example = (name) => fileURLToPath(new URL(`../../examples/${name}`, import.meta.url));

const base = {
  house: example('rush-creek.json'),
  tickets: example('tickets-2025-10-09.csv'),
  samples: example('samples-2025-10-09.csv'),
  bid: '4.2750',
};

let directory;

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'garnerbin-book-'));
});

afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});

describe('booking a day', () => {
  const result = runBook(base);

  it('writes a ticket entry for every ticket and a settlement for every inbound', () => {
    expect(result.journal.entries).toHaveLength(15);
    expect(result.text).toContain('Tickets          8');
    expect(result.text).toContain('Settlements      7');
  });

  it('seals the journal soundly', () => {
    expect(result.sound.ok).toBe(true);
    expect(result.journal.head).toMatch(/^[0-9a-f]{64}$/);
    expect(verifyJournal(result.journal).ok).toBe(true);
  });

  it('seals the same way twice', () => {
    expect(runBook(base).journal.head).toBe(result.journal.head);
  });

  it('seals differently when the bid moves', () => {
    expect(runBook({ ...base, bid: '4.2500' }).journal.head).not.toBe(result.journal.head);
  });

  it('books the weights alone when there is no bid', () => {
    const weightsOnly = runBook({ house: base.house, tickets: base.tickets });
    expect(weightsOnly.journal.entries).toHaveLength(8);
    expect(weightsOnly.text).toContain('Settlements      0');
  });

  it('foots the money it booked', () => {
    expect(result.text).toContain('Paid out');
    expect(result.text).toContain('Bushels settled');
  });
});

describe('writing the journal out', () => {
  it('writes a file that verifies when it is read back', async () => {
    const out = join(directory, 'journal.json');
    runBook({ ...base, out });
    const journal = JSON.parse(await readFile(out, 'utf8'));
    expect(verifyJournal(journal).ok).toBe(true);
    expect(journal.entries).toHaveLength(15);
  });

  it('breaks the seal when a written journal is edited', async () => {
    const out = join(directory, 'journal.json');
    runBook({ ...base, out });
    const journal = JSON.parse(await readFile(out, 'utf8'));
    journal.entries[3].detail.netCents = 1;
    expect(verifyJournal(journal).ok).toBe(false);
  });
});
