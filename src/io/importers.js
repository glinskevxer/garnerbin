import { FormatError } from '../core/errors.js';
import { isString, oneOf } from '../core/assert.js';
import { parsePrice } from '../core/money.js';
import { createTicket } from '../weights/ticket.js';
import { createSample } from '../grading/sample.js';
import { createQuoteBoard } from '../pricing/quotes.js';
import { createBasisBoard } from '../pricing/basis.js';
import { parseRecords } from './csv.js';
import { parseFixed } from './fixed.js';

/**
 * Bringing the outside world in.
 *
 * Every importer here works the same way: it reads the file, builds each row
 * into a domain object, and collects the rows that would not build rather than
 * throwing on the first one. A morning extract with four hundred tickets and
 * two bad ones should tell the operator which two, not stop on the first.
 */

export const FORMATS = Object.freeze(['csv', 'fixed']);

function readRows(text, { format = 'csv', layout } = {}) {
  oneOf(format, 'format', FORMATS);
  if (format === 'fixed') {
    if (!layout) {
      throw new FormatError('NO_LAYOUT', 'a fixed width import needs a layout', {});
    }
    return parseFixed(layout, isString(text, 'text', { allowEmpty: true }));
  }
  return parseRecords(text);
}

function collect(rows, build) {
  const records = [];
  const problems = [];
  rows.forEach((row, index) => {
    try {
      records.push(build(row));
    } catch (error) {
      problems.push({ row: index + 1, message: error.message, code: error.code ?? null });
    }
  });
  return { records, problems };
}

function toNumber(value, field) {
  if (value === null || value === undefined || value === '') return undefined;
  if (typeof value === 'number') return value;
  const parsed = Number(String(value).replace(/,/g, ''));
  if (!Number.isFinite(parsed)) {
    throw new FormatError('BAD_NUMBER', `${field} holds ${JSON.stringify(value)}`, { field });
  }
  return parsed;
}

export function importTickets(text, options = {}) {
  return collect(readRows(text, options), (row) =>
    createTicket({
      number: row.number ?? row.ticket,
      day: row.day ?? row.date,
      direction: row.direction || undefined,
      commodity: row.commodity,
      carrier: row.carrier || undefined,
      account: row.account,
      hauler: row.hauler || undefined,
      unit: row.unit || undefined,
      bin: row.bin || undefined,
      grossPounds: toNumber(row.grossPounds ?? row.gross, 'grossPounds'),
      tarePounds: toNumber(row.tarePounds ?? row.tare, 'tarePounds'),
      sampleId: row.sampleId || undefined,
      remarks: row.remarks ?? undefined,
    })
  );
}

const SAMPLE_NUMERIC = [
  'testWeight',
  'damagedTotal',
  'heatDamaged',
  'bcfm',
  'bnfm',
  'foreignMaterial',
  'splits',
  'otherColors',
  'shrunkenBroken',
  'defects',
  'wheatOtherClasses',
  'contrastingClasses',
  'moisture',
  'dockage',
  'protein',
  'fallingNumber',
];

export function importSamples(text, options = {}) {
  return collect(readRows(text, options), (row) => {
    const sample = {
      id: row.id ?? row.sample,
      commodity: row.commodity,
      day: row.day ?? row.date,
      grader: row.grader || undefined,
    };
    if (row.grams !== undefined && row.grams !== '') sample.grams = toNumber(row.grams, 'grams');
    for (const field of SAMPLE_NUMERIC) {
      const value = toNumber(row[field], field);
      if (value !== undefined) sample[field] = value;
    }
    return createSample(sample);
  });
}

export function importQuoteBoard(text, day, options = {}) {
  const rows = readRows(text, options);
  return createQuoteBoard({
    day,
    quotes: rows.map((row) => ({
      contract: row.contract,
      settle: parsePrice(String(row.settle)),
      volume: row.volume === undefined || row.volume === '' ? undefined : Number(row.volume),
    })),
  });
}

export function importBasisBoard(text, { house, commodity, day }, options = {}) {
  const rows = readRows(text, options);
  return createBasisBoard({
    house,
    commodity,
    day,
    quotes: rows.map((row) => ({
      period: row.period,
      contract: row.contract,
      basisPoints: parsePrice(String(row.basis)),
    })),
  });
}

export function summariseImport(result, what = 'rows') {
  const good = result.records.length;
  const bad = result.problems.length;
  if (bad === 0) return `${good} ${what}, all good`;
  return `${good} ${what} in, ${bad} refused`;
}
