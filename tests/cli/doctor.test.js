import { describe, expect, it } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runDoctor } from '../../src/cli/doctor.js';

const example = (name) => fileURLToPath(new URL(`../../examples/${name}`, import.meta.url));

const whole = {
  house: example('rush-creek.json'),
  tickets: example('tickets-2025-10-09.csv'),
  samples: example('samples-2025-10-09.csv'),
  contracts: example('contracts-2025.json'),
  hedge: example('hedge-book-2025-11-14.json'),
  board: example('board-2025-10-09.csv'),
  basis: example('basis-2025-10-09.csv'),
  day: '2025-10-09',
};

describe('the doctor on the worked day', () => {
  const result = runDoctor(whole);

  it('reads every file it was given', () => {
    expect(result.checked).toEqual([
      'house',
      'tickets',
      'samples',
      'contracts',
      'board',
      'hedge',
      'basis',
    ]);
  });

  it('finds nothing that stops the day', () => {
    expect(result.counts.stop).toBe(0);
  });

  it('says the hrw discount schedule is missing', () => {
    expect(result.findings.some((entry) => entry.code === 'NO_DISCOUNTS')).toBe(true);
  });

  it('prints what it read at the top', () => {
    expect(result.text).toContain('Rush Creek Grain doctor');
    expect(result.text).toContain('Read');
  });
});

describe('the doctor on the house alone', () => {
  it('checks only the house', () => {
    const result = runDoctor({ house: example('rush-creek.json') });
    expect(result.checked).toEqual(['house']);
    expect(result.findings.every((entry) => entry.code === 'NO_DISCOUNTS')).toBe(true);
  });
});

describe('catching disagreements', () => {
  it('stops on a hedge month the board does not carry', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'garnerbin-doctor-'));
    const thin = join(directory, 'board.csv');
    await writeFile(thin, 'contract,settle\nZCZ25,4.2500\n', 'utf8');
    const result = runDoctor({
      house: whole.house,
      hedge: example('hedge-book-2025-11-14.json'),
      board: thin,
      day: '2025-10-09',
    });
    expect(result.counts.stop).toBe(4);
    expect(result.findings.some((entry) => entry.code === 'MONTH_NOT_ON_BOARD')).toBe(true);
    await rm(directory, { recursive: true, force: true });
  });

  it('finds a contract on file for every account that delivered', () => {
    const result = runDoctor({
      house: whole.house,
      tickets: whole.tickets,
      contracts: whole.contracts,
    });
    expect(result.findings.some((entry) => entry.code === 'NO_CONTRACT')).toBe(false);
  });

  it('notes an account with no contract when the file is narrowed', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'garnerbin-doctor-'));
    const thin = join(directory, 'contracts.json');
    await writeFile(thin, JSON.stringify({ contracts: [] }), 'utf8');
    const result = runDoctor({ house: whole.house, tickets: whole.tickets, contracts: thin });
    expect(result.findings.filter((entry) => entry.code === 'NO_CONTRACT')).toHaveLength(4);
    await rm(directory, { recursive: true, force: true });
  });

  it('warns when the basis file does not quote the day', () => {
    const result = runDoctor({ ...whole, day: '2026-08-01' });
    expect(result.findings.some((entry) => entry.code === 'NO_BASIS_FOR_DAY')).toBe(true);
  });

  it('says every file agrees when there is nothing to say', () => {
    const bare = runDoctor({ house: whole.house, tickets: whole.tickets });
    expect(bare.text).toContain('NO_DISCOUNTS');
  });
});
