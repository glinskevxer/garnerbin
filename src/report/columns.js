import { isString } from '../core/assert.js';
import { formatBushels, formatMoney, formatPrice } from '../core/money.js';

/**
 * Column builders for the reports.
 *
 * Every report was writing the same three lines to put a bushel figure in a
 * right aligned column, and two of them formatted a null as the string "null"
 * because the guard was written slightly differently each time. A column that
 * has no value prints blank, everywhere, and it does so because it is built
 * here rather than at each call site.
 */

function valueOf(row, key) {
  return typeof key === 'function' ? key(row) : row[key];
}

export function textColumn(header, key, options = {}) {
  return {
    header: isString(header, 'header'),
    align: options.align ?? 'left',
    value: (row) => valueOf(row, key) ?? options.blank ?? '',
  };
}

export function bushelColumn(header, key, options = {}) {
  return {
    header: isString(header, 'header'),
    align: 'right',
    value: (row) => {
      const value = valueOf(row, key);
      return typeof value === 'number' ? formatBushels(value) : (options.blank ?? '');
    },
  };
}

export function moneyColumn(header, key, options = {}) {
  return {
    header: isString(header, 'header'),
    align: 'right',
    value: (row) => {
      const value = valueOf(row, key);
      if (typeof value !== 'number') return options.blank ?? '';
      if (value === 0 && options.hideZero) return '';
      return formatMoney(value, { sign: options.sign ?? false });
    },
  };
}

export function priceColumn(header, key, options = {}) {
  return {
    header: isString(header, 'header'),
    align: 'right',
    value: (row) => {
      const value = valueOf(row, key);
      return typeof value === 'number'
        ? formatPrice(value, options.places ?? 4)
        : (options.blank ?? '');
    },
  };
}

export function numberColumn(header, key, options = {}) {
  return {
    header: isString(header, 'header'),
    align: 'right',
    value: (row) => {
      const value = valueOf(row, key);
      if (typeof value !== 'number') return options.blank ?? '';
      return options.places === undefined ? String(value) : value.toFixed(options.places);
    },
  };
}
