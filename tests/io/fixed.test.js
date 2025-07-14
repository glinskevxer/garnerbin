import { describe, expect, it } from 'vitest';
import {
  createLayout,
  formatFixed,
  formatLine,
  layoutWidth,
  parseFixed,
  parseLine,
  TYPES,
} from '../../src/io/fixed.js';

const layout = createLayout([
  { name: 'ticket', start: 1, length: 8, type: 'text' },
  { name: 'day', start: 9, length: 8, type: 'day' },
  { name: 'grossPounds', start: 17, length: 7, type: 'integer' },
  { name: 'tarePounds', start: 24, length: 7, type: 'integer' },
  { name: 'moisture', start: 31, length: 4, type: 'decimal', places: 1 },
]);

describe('building a layout', () => {
  it('takes the four types', () => {
    expect(TYPES).toEqual(['text', 'integer', 'decimal', 'day']);
    expect(() => createLayout([{ name: 'x', start: 1, length: 2, type: 'binary' }])).toThrow(
      /must be one of/
    );
  });

  it('measures how wide the record is', () => {
    expect(layoutWidth(layout)).toBe(34);
  });

  it('refuses two fields that overlap', () => {
    expect(() =>
      createLayout([
        { name: 'a', start: 1, length: 5 },
        { name: 'b', start: 5, length: 5 },
      ])
    ).toThrow(/b starts inside a/);
  });

  it('allows a gap between fields', () => {
    expect(
      layoutWidth(
        createLayout([
          { name: 'a', start: 1, length: 3 },
          { name: 'b', start: 10, length: 3 },
        ])
      )
    ).toBe(12);
  });

  it('refuses the same name twice', () => {
    expect(() =>
      createLayout([
        { name: 'a', start: 1, length: 3 },
        { name: 'a', start: 5, length: 3 },
      ])
    ).toThrow(/is in the layout twice/);
  });
});

describe('reading a line', () => {
  const line = 'T-10441 ' + '20251009' + '0078500' + '0028100' + '0164';

  it('pulls each field out at its column', () => {
    expect(parseLine(layout, line)).toEqual({
      ticket: 'T-10441',
      day: '2025-10-09',
      grossPounds: 78_500,
      tarePounds: 28_100,
      moisture: 16.4,
    });
  });

  it('trims the padding off text and reads a blank as nothing', () => {
    const blanked = 'T-10442 ' + '20251009' + '0000000' + '0000000' + '    ';
    expect(parseLine(layout, blanked).moisture).toBeNull();
    expect(parseLine(layout, blanked).ticket).toBe('T-10442');
  });

  it('refuses a line that is short', () => {
    expect(() => parseLine(layout, 'T-1')).toThrow(/layout needs 34/);
  });

  it('refuses a number field with letters in it', () => {
    const bad = 'T-10441 ' + '20251009' + 'ABCDEFG' + '0028100' + '0164';
    expect(() => parseLine(layout, bad)).toThrow(/grossPounds holds/);
  });

  it('refuses a date that is not eight digits', () => {
    const bad = 'T-10441 ' + '2025-10-' + '0078500' + '0028100' + '0164';
    expect(() => parseLine(layout, bad)).toThrow(/day holds/);
  });

  it('reads a whole file and skips the blank lines', () => {
    const text = line + '\n\n' + line + '\n';
    expect(parseFixed(layout, text)).toHaveLength(2);
  });
});

describe('writing a line', () => {
  const record = {
    ticket: 'T-10441',
    day: '2025-10-09',
    grossPounds: 78_500,
    tarePounds: 28_100,
    moisture: 16.4,
  };

  it('pads the numbers with zeroes and the text with spaces', () => {
    const line = formatLine(layout, record);
    expect(line.slice(0, 8)).toBe('T-10441 ');
    expect(line.slice(16, 23)).toBe('0078500');
    expect(line.slice(30, 34)).toBe('0164');
  });

  it('round trips', () => {
    expect(parseLine(layout, formatLine(layout, record))).toEqual(record);
  });

  it('blanks a field that has nothing in it', () => {
    const line = formatLine(layout, { ...record, moisture: null });
    expect(line.slice(30, 34)).toBe('    ');
  });

  it('clips text that is too long for its column', () => {
    const line = formatLine(layout, { ...record, ticket: 'T-104419999' });
    expect(line.slice(0, 8)).toBe('T-104419');
  });

  it('writes a file with a newline on every record', () => {
    expect(formatFixed(layout, [record, record]).split('\n')).toHaveLength(3);
  });
});
