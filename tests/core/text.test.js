import { describe, expect, it } from 'vitest';
import {
  clip,
  heading,
  indent,
  joinList,
  keyValue,
  pad,
  plural,
  renderTable,
  wrap,
} from '../../src/core/text.js';

describe('pad and clip', () => {
  it('pads three ways', () => {
    expect(pad('corn', 8)).toBe('corn    ');
    expect(pad('corn', 8, 'right')).toBe('    corn');
    expect(pad('corn', 8, 'center')).toBe('  corn  ');
  });

  it('leaves anything already wide enough alone', () => {
    expect(pad('soybeans', 4)).toBe('soybeans');
    expect(pad(null, 3)).toBe('   ');
  });

  it('clips with a marker', () => {
    expect(clip('hard red winter', 8)).toBe('hard r..');
    expect(clip('hrw', 8)).toBe('hrw');
    expect(clip('hard red winter', 2)).toBe('ha');
  });
});

describe('renderTable', () => {
  const columns = [
    { header: 'ticket', key: 'ticket' },
    { header: 'bushels', key: 'bushels', align: 'right' },
    { header: 'grade', value: (row) => `US ${row.grade}` },
  ];
  const rows = [
    { ticket: 'T-1001', bushels: '900.00', grade: 2 },
    { ticket: 'T-1002', bushels: '1,244.50', grade: 3 },
  ];

  it('lines the columns up on the widest cell', () => {
    const table = renderTable(columns, rows).split('\n');
    expect(table[0]).toBe('ticket   bushels  grade');
    expect(table[1]).toBe('------  --------  -----');
    expect(table[2]).toBe('T-1001    900.00  US 2');
    expect(table[3]).toBe('T-1002  1,244.50  US 3');
  });

  it('honours a minimum column width', () => {
    const wide = renderTable([{ header: 'id', key: 'ticket', width: 10 }], rows).split('\n');
    expect(wide[1]).toBe('----------');
  });

  it('renders a header and a rule with no rows', () => {
    expect(renderTable(columns, []).split('\n')).toHaveLength(2);
  });

  it('leaves an empty cell blank rather than printing undefined', () => {
    const table = renderTable([{ header: 'note', key: 'note' }], [{ note: undefined }]);
    expect(table.split('\n')[2]).toBe('');
  });
});

describe('small helpers', () => {
  it('makes a heading with a rule under it', () => {
    expect(heading('daily position')).toBe('daily position\n======================');
  });

  it('lays out label and value pairs', () => {
    expect(
      keyValue([
        ['gross', '78,500'],
        ['tare', '28,100'],
      ])
    ).toBe('gross  78,500\ntare   28,100');
  });

  it('pluralises', () => {
    expect(plural(1, 'load')).toBe('1 load');
    expect(plural(3, 'load')).toBe('3 loads');
    expect(plural(2, 'bushel of corn', 'bushels of corn')).toBe('2 bushels of corn');
  });

  it('joins a list the way a sentence does', () => {
    expect(joinList([])).toBe('');
    expect(joinList(['corn'])).toBe('corn');
    expect(joinList(['corn', 'milo'])).toBe('corn and milo');
    expect(joinList(['corn', 'milo', 'beans'])).toBe('corn, milo and beans');
    expect(joinList(['corn', 'milo'], 'or')).toBe('corn or milo');
  });

  it('indents every line but the blank ones', () => {
    expect(indent('a\n\nb')).toBe('  a\n\n  b');
  });

  it('wraps at the width', () => {
    expect(wrap('the load came in wet and went straight to the dryer', 20)).toBe(
      'the load came in wet\nand went straight to\nthe dryer'
    );
    expect(wrap('', 20)).toBe('');
  });
});
