import { FormatError } from '../core/errors.js';
import { isArray, isString } from '../core/assert.js';

/**
 * Comma separated files, read and written the way the outside world sends them.
 *
 * The scale software, the broker and the co-op all export CSV and every one of
 * them quotes differently. This handles quoted fields with commas and newlines
 * inside, doubled quotes, and files that arrive with CRLF because they came off
 * a Windows box, which is all of them.
 */

export function parseCsv(text, { delimiter = ',' } = {}) {
  isString(text, 'text', { allowEmpty: true });
  if (delimiter.length !== 1) {
    throw new FormatError('BAD_DELIMITER', 'the delimiter has to be one character', { delimiter });
  }
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  let index = 0;
  let started = false;

  while (index < text.length) {
    const character = text[index];
    if (quoted) {
      if (character === '"') {
        if (text[index + 1] === '"') {
          field += '"';
          index += 2;
          continue;
        }
        quoted = false;
        index += 1;
        continue;
      }
      field += character;
      index += 1;
      continue;
    }
    if (character === '"' && field === '') {
      quoted = true;
      started = true;
      index += 1;
      continue;
    }
    if (character === delimiter) {
      row.push(field);
      field = '';
      started = true;
      index += 1;
      continue;
    }
    if (character === '\r' && text[index + 1] === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
      started = false;
      index += 2;
      continue;
    }
    if (character === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
      started = false;
      index += 1;
      continue;
    }
    field += character;
    started = true;
    index += 1;
  }
  if (quoted) {
    throw new FormatError('UNCLOSED_QUOTE', 'the file ends inside a quoted field', {});
  }
  if (started || field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

/** Read a file with a header row into objects keyed by the header. */
export function parseRecords(text, options = {}) {
  const rows = parseCsv(text, options);
  if (rows.length === 0) return [];
  const [header, ...body] = rows;
  const seen = new Set();
  for (const name of header) {
    if (seen.has(name)) {
      throw new FormatError('DUPLICATE_COLUMN', `${name} appears twice in the header`, { name });
    }
    seen.add(name);
  }
  return body.map((row, rowIndex) => {
    if (row.length !== header.length) {
      throw new FormatError(
        'WRONG_COLUMN_COUNT',
        `row ${rowIndex + 2} has ${row.length} fields against ${header.length} columns`,
        { row: rowIndex + 2, found: row.length, expected: header.length }
      );
    }
    return Object.fromEntries(header.map((name, columnIndex) => [name, row[columnIndex]]));
  });
}

export function quoteField(value, delimiter = ',') {
  const text = value === null || value === undefined ? '' : String(value);
  if (text.includes('"') || text.includes(delimiter) || /[\r\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

export function toCsv(rows, columns, { delimiter = ',', newline = '\n' } = {}) {
  isArray(rows, 'rows');
  isArray(columns, 'columns', { minLength: 1 });
  const header = columns.map((column) => quoteField(column.header ?? column.key, delimiter));
  const body = rows.map((row) =>
    columns
      .map((column) => {
        const raw = typeof column.value === 'function' ? column.value(row) : row[column.key];
        return quoteField(raw, delimiter);
      })
      .join(delimiter)
  );
  return [header.join(delimiter), ...body].join(newline) + newline;
}
