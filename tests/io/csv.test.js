import { describe, expect, it } from 'vitest';
import { parseCsv, parseRecords, quoteField, toCsv } from '../../src/io/csv.js';

describe('parseCsv', () => {
  it('reads plain rows', () => {
    expect(parseCsv('a,b,c\n1,2,3\n')).toEqual([
      ['a', 'b', 'c'],
      ['1', '2', '3'],
    ]);
  });

  it('reads a file that came off a windows box', () => {
    expect(parseCsv('a,b\r\n1,2\r\n')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });

  it('reads a last line with no newline on it', () => {
    expect(parseCsv('a,b\n1,2')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });

  it('keeps a comma inside quotes', () => {
    expect(parseCsv('name,note\n"Halvorsen, R",wet')).toEqual([
      ['name', 'note'],
      ['Halvorsen, R', 'wet'],
    ]);
  });

  it('keeps a newline inside quotes', () => {
    expect(parseCsv('note\n"line one\nline two"')).toEqual([['note'], ['line one\nline two']]);
  });

  it('reads a doubled quote as one quote', () => {
    expect(parseCsv('note\n"he said ""wet"""')).toEqual([['note'], ['he said "wet"']]);
  });

  it('keeps empty fields', () => {
    expect(parseCsv('a,,c')).toEqual([['a', '', 'c']]);
  });

  it('reads an empty file as nothing', () => {
    expect(parseCsv('')).toEqual([]);
  });

  it('takes another delimiter', () => {
    expect(parseCsv('a|b\n1|2', { delimiter: '|' })).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
    expect(() => parseCsv('a', { delimiter: '||' })).toThrow(/one character/);
  });

  it('refuses a file that ends inside a quote', () => {
    expect(() => parseCsv('a\n"unfinished')).toThrow(/ends inside a quoted field/);
  });
});

describe('parseRecords', () => {
  it('keys the rows off the header', () => {
    expect(parseRecords('ticket,bushels\nT-1,900.00\nT-2,1244.50\n')).toEqual([
      { ticket: 'T-1', bushels: '900.00' },
      { ticket: 'T-2', bushels: '1244.50' },
    ]);
  });

  it('refuses a row with the wrong number of fields', () => {
    expect(() => parseRecords('a,b\n1,2,3\n')).toThrow(/row 2 has 3 fields against 2 columns/);
  });

  it('refuses a duplicated column name', () => {
    expect(() => parseRecords('a,a\n1,2\n')).toThrow(/appears twice/);
  });

  it('reads a header with no rows under it as nothing', () => {
    expect(parseRecords('a,b\n')).toEqual([]);
  });
});

describe('writing', () => {
  it('quotes only what needs quoting', () => {
    expect(quoteField('plain')).toBe('plain');
    expect(quoteField('with,comma')).toBe('"with,comma"');
    expect(quoteField('with"quote')).toBe('"with""quote"');
    expect(quoteField(null)).toBe('');
  });

  it('writes a header and the rows', () => {
    const csv = toCsv(
      [{ ticket: 'T-1', note: 'wet, hot' }],
      [
        { header: 'ticket', key: 'ticket' },
        { header: 'note', key: 'note' },
      ]
    );
    expect(csv).toBe('ticket,note\nT-1,"wet, hot"\n');
  });

  it('takes a computed column', () => {
    const csv = toCsv([{ a: 2 }], [{ header: 'double', value: (row) => row.a * 2 }]);
    expect(csv).toBe('double\n4\n');
  });

  it('round trips', () => {
    const rows = [{ a: 'one, two', b: 'he said "hi"' }];
    const csv = toCsv(rows, [
      { header: 'a', key: 'a' },
      { header: 'b', key: 'b' },
    ]);
    expect(parseRecords(csv)).toEqual(rows);
  });
});
