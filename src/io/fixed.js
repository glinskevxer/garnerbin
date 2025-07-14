import { FormatError } from '../core/errors.js';
import { isArray, isInteger, isString, oneOf, positive } from '../core/assert.js';
import { roundHalfUp } from '../core/numbers.js';
import { assertDay } from '../core/dates.js';

/**
 * Fixed width records.
 *
 * The scale house computer is older than most of the trucks and it writes a
 * flat file with columns nailed to character positions. There is no delimiter
 * and no header, so the layout is the whole contract, and a layout with two
 * fields overlapping by one column will read every ticket slightly wrong
 * forever without ever raising an error. So the layout is checked once, hard,
 * before it is ever used.
 */

export const TYPES = Object.freeze(['text', 'integer', 'decimal', 'day']);

export function createLayout(fields) {
  isArray(fields, 'fields', { minLength: 1 });
  const built = fields.map((field) => {
    const start = positive(isInteger(field.start, 'start'), 'start');
    const length = positive(isInteger(field.length, 'length'), 'length');
    return Object.freeze({
      name: isString(field.name, 'name'),
      start,
      length,
      end: start + length - 1,
      type: oneOf(field.type ?? 'text', 'type', TYPES),
      places: field.places ?? 2,
      pad: field.pad ?? (field.type === 'text' ? ' ' : '0'),
    });
  });
  const ordered = [...built].sort((a, b) => a.start - b.start);
  for (let index = 1; index < ordered.length; index += 1) {
    if (ordered[index].start <= ordered[index - 1].end) {
      throw new FormatError(
        'FIELDS_OVERLAP',
        `${ordered[index].name} starts inside ${ordered[index - 1].name}`,
        { first: ordered[index - 1].name, second: ordered[index].name }
      );
    }
  }
  const names = built.map((field) => field.name);
  const duplicate = names.find((name, index) => names.indexOf(name) !== index);
  if (duplicate) {
    throw new FormatError('DUPLICATE_FIELD', `${duplicate} is in the layout twice`, {
      name: duplicate,
    });
  }
  return Object.freeze(built);
}

export function layoutWidth(layout) {
  return layout.reduce((widest, field) => Math.max(widest, field.end), 0);
}

function readValue(field, raw) {
  const text = raw.trim();
  if (field.type === 'text') return text;
  if (text === '') return null;
  if (field.type === 'day') {
    if (!/^\d{8}$/.test(text)) {
      throw new FormatError('BAD_FIXED_DAY', `${field.name} holds ${JSON.stringify(text)}`, {
        field: field.name,
        value: text,
      });
    }
    return assertDay(`${text.slice(0, 4)}-${text.slice(4, 6)}-${text.slice(6, 8)}`, field.name);
  }
  if (!/^-?\d+$/.test(text)) {
    throw new FormatError('BAD_FIXED_NUMBER', `${field.name} holds ${JSON.stringify(text)}`, {
      field: field.name,
      value: text,
    });
  }
  const number = Number(text);
  return field.type === 'integer' ? number : roundHalfUp(number / 10 ** field.places, field.places);
}

export function parseLine(layout, line) {
  isString(line, 'line', { allowEmpty: true });
  const width = layoutWidth(layout);
  if (line.length < width) {
    throw new FormatError(
      'LINE_TOO_SHORT',
      `the line is ${line.length} characters, layout needs ${width}`,
      {
        length: line.length,
        width,
      }
    );
  }
  const record = {};
  for (const field of layout) {
    record[field.name] = readValue(field, line.slice(field.start - 1, field.end));
  }
  return record;
}

export function parseFixed(layout, text) {
  return text
    .split(/\r?\n/)
    .filter((line) => line.trim() !== '')
    .map((line) => parseLine(layout, line));
}

function writeValue(field, value) {
  if (value === null || value === undefined) return ''.padEnd(field.length, ' ');
  if (field.type === 'text') return String(value).slice(0, field.length).padEnd(field.length, ' ');
  if (field.type === 'day') return assertDay(value, field.name).replace(/-/g, '');
  const scaled =
    field.type === 'integer' ? Math.round(value) : Math.round(value * 10 ** field.places);
  const body = String(Math.abs(scaled)).padStart(field.length - (scaled < 0 ? 1 : 0), field.pad);
  return `${scaled < 0 ? '-' : ''}${body}`.slice(-field.length);
}

export function formatLine(layout, record) {
  const width = layoutWidth(layout);
  const characters = new Array(width).fill(' ');
  for (const field of layout) {
    const written = writeValue(field, record[field.name]);
    for (let offset = 0; offset < field.length; offset += 1) {
      characters[field.start - 1 + offset] = written[offset] ?? ' ';
    }
  }
  return characters.join('');
}

export function formatFixed(layout, records) {
  return records.map((record) => formatLine(layout, record)).join('\n') + '\n';
}
