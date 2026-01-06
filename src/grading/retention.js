import { GradeError } from '../core/errors.js';
import { isArray, isPlainObject, isString, positive } from '../core/assert.js';
import { addDays, assertDay, compareDays, daysBetween } from '../core/dates.js';
import { renderTable } from '../core/text.js';

/**
 * The sample file.
 *
 * Every graded sample is kept. When a grower disputes a grade six weeks later
 * the argument is settled by pulling his sample out of the drawer and regrading
 * it, and a house that threw it away loses the argument whatever the tickets
 * say.
 *
 * The file has a shelf life. Samples come out on a schedule, and the point of
 * this is that the schedule is followed rather than the drawer filling up until
 * somebody clears it out on a slow afternoon and throws away the one that
 * mattered.
 */

export const DEFAULT_RETENTION_DAYS = 60;
export const DISPUTED_RETENTION_DAYS = 365;

export function fileSample(input) {
  isPlainObject(input, 'record');
  return Object.freeze({
    sample: isString(input.sample, 'sample'),
    ticket: input.ticket === undefined ? null : isString(input.ticket, 'ticket'),
    filedOn: assertDay(input.filedOn, 'filedOn'),
    drawer: isString(input.drawer, 'drawer'),
    grams: positive(input.grams ?? 1000, 'grams'),
    disputed: input.disputed === true,
    pulledOn: null,
    events: Object.freeze([
      Object.freeze({
        event: 'filed',
        day: assertDay(input.filedOn, 'filedOn'),
        by: input.by ?? null,
      }),
    ]),
  });
}

export function retentionDays(record) {
  return record.disputed ? DISPUTED_RETENTION_DAYS : DEFAULT_RETENTION_DAYS;
}

export function keepUntil(record) {
  return addDays(record.filedOn, retentionDays(record));
}

export function isDisposable(record, asOf) {
  if (record.pulledOn !== null) return false;
  return compareDays(assertDay(asOf, 'asOf'), keepUntil(record)) > 0;
}

export function daysLeft(record, asOf) {
  return daysBetween(assertDay(asOf, 'asOf'), keepUntil(record));
}

function withEvent(record, event) {
  return Object.freeze({
    ...record,
    events: Object.freeze([...record.events, Object.freeze(event)]),
  });
}

/** Somebody took the sample out to look at it. It goes back, and it is noted. */
export function inspect(record, { day, by, why }) {
  if (record.pulledOn !== null) {
    throw new GradeError(
      'SAMPLE_GONE',
      `${record.sample} came out of the file on ${record.pulledOn}`,
      {
        sample: record.sample,
      }
    );
  }
  return withEvent(record, {
    event: 'inspected',
    day: assertDay(day, 'day'),
    by: by ?? null,
    why: why ?? null,
  });
}

/** A dispute holds the sample for a year from the day it was raised. */
export function markDisputed(record, { day, by }) {
  if (record.pulledOn !== null) {
    throw new GradeError('SAMPLE_GONE', `${record.sample} is not in the file any more`, {
      sample: record.sample,
    });
  }
  return withEvent(Object.freeze({ ...record, disputed: true, filedOn: assertDay(day, 'day') }), {
    event: 'disputed',
    day: assertDay(day, 'day'),
    by: by ?? null,
  });
}

export function dispose(record, { day, by }) {
  if (record.pulledOn !== null) {
    throw new GradeError('ALREADY_PULLED', `${record.sample} was pulled on ${record.pulledOn}`, {
      sample: record.sample,
    });
  }
  if (!isDisposable(record, day)) {
    throw new GradeError(
      'STILL_IN_RETENTION',
      `${record.sample} is held until ${keepUntil(record)}`,
      {
        sample: record.sample,
        keepUntil: keepUntil(record),
        day,
      }
    );
  }
  return withEvent(Object.freeze({ ...record, pulledOn: assertDay(day, 'day') }), {
    event: 'disposed',
    day: assertDay(day, 'day'),
    by: by ?? null,
  });
}

export function inFile(records) {
  return records.filter((record) => record.pulledOn === null);
}

export function dueForDisposal(records, asOf) {
  return inFile(records)
    .filter((record) => isDisposable(record, asOf))
    .sort((a, b) => compareDays(a.filedOn, b.filedOn));
}

export function findByTicket(records, ticket) {
  return records.filter((record) => record.ticket === ticket);
}

export function drawerReport(records, asOf) {
  isArray(records, 'records');
  const rows = inFile(records).map((record) => ({
    sample: record.sample,
    ticket: record.ticket ?? '',
    drawer: record.drawer,
    filedOn: record.filedOn,
    keepUntil: keepUntil(record),
    daysLeft: daysLeft(record, asOf),
    status: record.disputed ? 'disputed' : isDisposable(record, asOf) ? 'due out' : 'held',
  }));
  return renderTable(
    [
      { header: 'sample', key: 'sample' },
      { header: 'ticket', key: 'ticket' },
      { header: 'drawer', key: 'drawer' },
      { header: 'filed', key: 'filedOn' },
      { header: 'keep until', key: 'keepUntil' },
      { header: 'days', key: 'daysLeft', align: 'right' },
      { header: 'status', key: 'status' },
    ],
    rows
  );
}
