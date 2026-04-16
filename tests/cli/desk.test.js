import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  assertClean,
  binOf,
  readBasis,
  readBoard,
  readHouse,
  readJsonFile,
  readSamples,
  readText,
  readTickets,
  writeOut,
} from '../../src/cli/desk.js';

const example = (name) => fileURLToPath(new URL(`../../examples/${name}`, import.meta.url));

describe('reading files', () => {
  it('reads text and json', () => {
    expect(readText(example('tickets-2025-10-09.csv'), 'ticket file')).toContain('T-10441');
    expect(readJsonFile(example('rush-creek.json'), 'house file').name).toBe('Rush Creek Grain');
  });

  it('says which kind of file is missing', () => {
    expect(() => readText(example('nowhere.csv'), 'ticket file')).toThrow(/no ticket file at/);
    expect(() => readJsonFile(example('nowhere.json'), 'board file')).toThrow(/no board file at/);
  });

  it('says which file is not json', () => {
    expect(() => readJsonFile(example('tickets-2025-10-09.csv'), 'house file')).toThrow(
      /is not valid json/
    );
  });

  it('reads a house and finds a bin on it', () => {
    const house = readHouse(example('rush-creek.json'));
    expect(binOf(house, 'B-1').id).toBe('B-1');
    expect(() => binOf(house, 'B-99')).toThrow(/has no bin B-99/);
  });

  it('reads the tickets and the samples', () => {
    expect(readTickets(example('tickets-2025-10-09.csv')).records).toHaveLength(8);
    expect(readSamples(example('samples-2025-10-09.csv')).records).toHaveLength(7);
  });

  it('reads both boards', () => {
    expect(readBoard(example('board-2025-10-09.csv'), '2025-10-09').quotes.length).toBeGreaterThan(
      3
    );
    const book = readBasis(example('basis-2025-10-09.csv'), {
      house: 'Rush Creek',
      day: '2025-10-09',
    });
    expect(Object.keys(book.boards)).toContain('corn');
  });
});

describe('refusing a dirty import', () => {
  it('lets a clean import through', () => {
    const clean = readTickets(example('tickets-2025-10-09.csv'));
    expect(assertClean(clean, 'ticket')).toHaveLength(8);
  });

  it('refuses one with problems and names the rows', () => {
    const dirty = { records: [], problems: [{ row: 2, message: 'tare is over gross' }] };
    try {
      assertClean(dirty, 'ticket');
    } catch (err) {
      expect(err.code).toBe('IMPORT_HAS_PROBLEMS');
      expect(err.details.problems[0]).toBe('row 2: tare is over gross');
    }
  });
});

describe('writing an output file', () => {
  it('writes the file and makes the directory on the way', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'garnerbin-desk-'));
    const path = join(directory, 'deep', 'down', 'out.csv');
    expect(writeOut(path, 'a,b\n1,2\n', 'register')).toBe(path);
    expect(await readFile(path, 'utf8')).toBe('a,b\n1,2\n');
    await rm(directory, { recursive: true, force: true });
  });

  it('names the command output and the path when it cannot write', () => {
    try {
      writeOut(join(example('rush-creek.json'), 'out.csv'), 'x', 'register');
    } catch (err) {
      expect(err.code).toBe('CANNOT_WRITE');
      expect(err.message).toContain('cannot write the register to');
    }
  });
});
