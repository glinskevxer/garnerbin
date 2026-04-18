import { describe, expect, it } from 'vitest';
import { renderTable } from '../../src/core/text.js';
import {
  bushelColumn,
  moneyColumn,
  numberColumn,
  priceColumn,
  textColumn,
} from '../../src/report/columns.js';

const row = {
  name: 'Halvorsen',
  bushels: 123_456,
  cents: 384_750,
  price: 42_750,
  moisture: 16.42,
  missing: null,
};

function cell(column, source = row) {
  return column.value(source);
}

describe('the column builders', () => {
  it('right aligns everything but text', () => {
    expect(textColumn('a', 'name').align).toBe('left');
    expect(bushelColumn('a', 'bushels').align).toBe('right');
    expect(moneyColumn('a', 'cents').align).toBe('right');
    expect(priceColumn('a', 'price').align).toBe('right');
    expect(numberColumn('a', 'moisture').align).toBe('right');
  });

  it('formats each kind the way the office prints it', () => {
    expect(cell(bushelColumn('a', 'bushels'))).toBe('1,234.56');
    expect(cell(moneyColumn('a', 'cents'))).toBe('3,847.50');
    expect(cell(priceColumn('a', 'price'))).toBe('4.2750');
    expect(cell(priceColumn('a', 'price', { places: 2 }))).toBe('4.27');
    expect(cell(numberColumn('a', 'moisture', { places: 1 }))).toBe('16.4');
    expect(cell(numberColumn('a', 'moisture'))).toBe('16.42');
  });

  it('prints a missing value blank rather than as null', () => {
    for (const column of [
      bushelColumn('a', 'missing'),
      moneyColumn('a', 'missing'),
      priceColumn('a', 'missing'),
      numberColumn('a', 'missing'),
      textColumn('a', 'missing'),
    ]) {
      expect(cell(column)).toBe('');
    }
  });

  it('prints a field nobody set blank too', () => {
    expect(cell(bushelColumn('a', 'nothing'))).toBe('');
    expect(cell(textColumn('a', 'nothing'))).toBe('');
  });

  it('takes a blank of its own', () => {
    expect(cell(bushelColumn('a', 'missing', { blank: 'n/a' }))).toBe('n/a');
  });

  it('takes a function instead of a key', () => {
    expect(cell(bushelColumn('a', (entry) => entry.bushels * 2))).toBe('2,469.12');
  });

  it('signs money when asked and hides a zero when asked', () => {
    expect(cell(moneyColumn('a', 'cents', { sign: true }))).toBe('+3,847.50');
    expect(cell(moneyColumn('a', 'zero', { hideZero: true }), { zero: 0 })).toBe('');
    expect(cell(moneyColumn('a', 'zero'), { zero: 0 })).toBe('0.00');
  });

  it('refuses a column with no header', () => {
    expect(() => bushelColumn(undefined, 'bushels')).toThrow(/header is required/);
  });
});

describe('columns in a table', () => {
  it('render through the ordinary table renderer', () => {
    const text = renderTable(
      [textColumn('who', 'name'), bushelColumn('bushels', 'bushels'), moneyColumn('net', 'cents')],
      [row, { name: 'Drake', bushels: 90_000, cents: null }]
    );
    const lines = text.split('\n');
    expect(lines[0]).toBe('who         bushels       net');
    expect(lines[3]).toBe('Drake        900.00');
  });
});
