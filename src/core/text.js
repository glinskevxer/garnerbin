import { isInteger, isString } from './assert.js';

/**
 * Everything the office prints lands on a fixed width terminal or a dot matrix
 * form, so the report code needs padding and column layout and nothing more
 * clever than that.
 */

export function pad(value, width, align = 'left') {
  const text = String(value ?? '');
  isInteger(width, 'width');
  if (text.length >= width) return text;
  const filler = ' '.repeat(width - text.length);
  if (align === 'right') return filler + text;
  if (align === 'center') {
    const left = Math.floor(filler.length / 2);
    return ' '.repeat(left) + text + ' '.repeat(filler.length - left);
  }
  return text + filler;
}

export function clip(value, width, ellipsis = '..') {
  const text = String(value ?? '');
  isInteger(width, 'width');
  if (text.length <= width) return text;
  if (width <= ellipsis.length) return text.slice(0, width);
  return text.slice(0, width - ellipsis.length) + ellipsis;
}

/**
 * Render rows under a header. Columns are described once and every row is read
 * through the same accessor, which is what keeps a report from drifting out of
 * line when somebody adds a field.
 */
export function renderTable(columns, rows, { gap = 2, rule = '-' } = {}) {
  const widths = columns.map((column) => {
    const cells = rows.map((row) => String(pickCell(column, row)));
    return Math.max(column.header.length, ...cells.map((cell) => cell.length), column.width ?? 0);
  });
  const spacer = ' '.repeat(gap);
  const header = columns
    .map((column, index) => pad(column.header, widths[index], column.align ?? 'left'))
    .join(spacer)
    .trimEnd();
  const divider = widths.map((width) => rule.repeat(width)).join(spacer);
  const body = rows.map((row) =>
    columns
      .map((column, index) => pad(pickCell(column, row), widths[index], column.align ?? 'left'))
      .join(spacer)
      .trimEnd()
  );
  return [header, divider, ...body].join('\n');
}

function pickCell(column, row) {
  const raw = typeof column.value === 'function' ? column.value(row) : row[column.key];
  return raw ?? '';
}

export function heading(text, width = 72, rule = '=') {
  isString(text, 'text');
  return `${text}\n${rule.repeat(Math.max(text.length, Math.min(width, text.length + 8)))}`;
}

export function keyValue(pairs, { gap = 2 } = {}) {
  const width = Math.max(...pairs.map(([label]) => label.length));
  return pairs.map(([label, value]) => `${pad(label, width)}${' '.repeat(gap)}${value}`).join('\n');
}

export function plural(count, one, many = `${one}s`) {
  return count === 1 ? `1 ${one}` : `${count} ${many}`;
}

export function joinList(items, conjunction = 'and') {
  if (items.length === 0) return '';
  if (items.length === 1) return String(items[0]);
  if (items.length === 2) return `${items[0]} ${conjunction} ${items[1]}`;
  return `${items.slice(0, -1).join(', ')} ${conjunction} ${items[items.length - 1]}`;
}

export function indent(text, spaces = 2) {
  const filler = ' '.repeat(spaces);
  return text
    .split('\n')
    .map((line) => (line === '' ? line : filler + line))
    .join('\n');
}

export function wrap(text, width = 72) {
  isString(text, 'text', { allowEmpty: true });
  const words = text.split(/\s+/).filter(Boolean);
  const lines = [];
  let line = '';
  for (const word of words) {
    if (line === '') line = word;
    else if (line.length + 1 + word.length <= width) line += ` ${word}`;
    else {
      lines.push(line);
      line = word;
    }
  }
  if (line !== '') lines.push(line);
  return lines.join('\n');
}
