import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { GENESIS } from '../../src/audit/journal.js';
import { runBook } from '../../src/cli/book.js';
import { runAudit } from '../../src/cli/audit.js';

const example = (name) => fileURLToPath(new URL(`../../examples/${name}`, import.meta.url));

let directory;
let journalPath;

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'garnerbin-audit-'));
  journalPath = join(directory, 'journal.json');
  runBook({
    house: example('rush-creek.json'),
    tickets: example('tickets-2025-10-09.csv'),
    samples: example('samples-2025-10-09.csv'),
    bid: '4.2750',
    out: journalPath,
  });
});

afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});

describe('auditing a sound journal', () => {
  it('verifies and replays it', () => {
    const result = runAudit({ file: journalPath });
    expect(result.sound.ok).toBe(true);
    expect(result.replayed.entries).toBe(15);
    expect(result.text).toContain('Verifies');
    expect(result.text).toContain('7 settlements');
  });

  it('breaks the accounts out', () => {
    const result = runAudit({ file: journalPath });
    expect(result.replayed.accounts.length).toBeGreaterThan(1);
    expect(result.text).toContain('HALVORSEN');
  });

  it('stops the replay at a day', () => {
    expect(runAudit({ file: journalPath, through: '2025-10-08' }).replayed.entries).toBe(0);
  });
});

describe('auditing against the tickets', () => {
  it('agrees with a register built from the same tickets', () => {
    const result = runAudit({
      file: journalPath,
      tickets: example('tickets-2025-10-09.csv'),
      day: '2025-10-09',
    });
    expect(result.agreement.ok).toBe(true);
    expect(result.text).toContain('agrees with the register');
  });

  it('says so when the tickets do not match', async () => {
    const thin = join(directory, 'thin.csv');
    await writeFile(
      thin,
      [
        'number,day,commodity,account,grossPounds,tarePounds',
        'T-10441,2025-10-09,corn,HALVORSEN,78500,28100',
        '',
      ].join('\n'),
      'utf8'
    );
    const result = runAudit({ file: journalPath, tickets: thin, day: '2025-10-09' });
    expect(result.agreement.ok).toBe(false);
    expect(result.text).toContain('disagree');
  });
});

describe('auditing a broken journal', () => {
  it('stops at the seal and prints nothing else', async () => {
    const journal = JSON.parse(await readFile(journalPath, 'utf8'));
    journal.head = GENESIS;
    const broken = join(directory, 'broken.json');
    await writeFile(broken, JSON.stringify(journal), 'utf8');
    const result = runAudit({ file: broken });
    expect(result.sound.ok).toBe(false);
    expect(result.replayed).toBeNull();
    expect(result.text).toContain('does not verify');
    expect(result.text).not.toContain('settlements');
  });

  it('catches an entry that was edited', async () => {
    const journal = JSON.parse(await readFile(journalPath, 'utf8'));
    journal.entries[2].detail.netCents = 1;
    const edited = join(directory, 'edited.json');
    await writeFile(edited, JSON.stringify(journal), 'utf8');
    expect(runAudit({ file: edited }).sound.brokenAt).toBe(3);
  });

  it('refuses a file that is not a journal', () => {
    expect(() => runAudit({ file: example('rush-creek.json') })).toThrow(/carries no entries/);
  });
});
