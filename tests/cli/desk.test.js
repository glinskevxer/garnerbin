import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
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
