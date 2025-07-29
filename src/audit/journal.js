import { createHash } from 'node:crypto';
import { ConfigError } from '../core/errors.js';
import { isArray, isPlainObject, isString } from '../core/assert.js';
import { assertDay } from '../core/dates.js';

/**
 * The audit journal.
 *
 * Everything that changes money or bushels goes in here, and each entry carries
 * the hash of the one before it. Editing an old entry changes its hash, which
 * breaks every hash after it, which is exactly what the auditor wants to be
 * able to check without trusting the office.
 *
 * The hash covers a canonical form of the entry rather than its JSON, because
 * two objects with the same fields in a different order are the same entry and
 * must not seal differently.
 */

export const GENESIS = '0'.repeat(64);

function canonical(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
}

export function hashEntry(previousHash, entry) {
  isString(previousHash, 'previousHash');
  return createHash('sha256')
    .update(`${previousHash}${canonical(entry)}`)
    .digest('hex');
}

export function openJournal(house) {
  return Object.freeze({
    house: isString(house, 'house'),
    entries: Object.freeze([]),
    head: GENESIS,
  });
}

export function appendEntry(journal, entry) {
  isPlainObject(entry, 'entry');
  const body = {
    sequence: journal.entries.length + 1,
    day: assertDay(entry.day, 'day'),
    event: isString(entry.event, 'event'),
    detail: entry.detail ?? {},
  };
  const hash = hashEntry(journal.head, body);
  return Object.freeze({
    house: journal.house,
    entries: Object.freeze([
      ...journal.entries,
      Object.freeze({ ...body, previous: journal.head, hash }),
    ]),
    head: hash,
  });
}

export function appendAll(journal, entries) {
  isArray(entries, 'entries');
  return entries.reduce((current, entry) => appendEntry(current, entry), journal);
}

/** Walk the chain and report the first link that does not hold. */
export function verifyJournal(journal) {
  let previous = GENESIS;
  for (const entry of journal.entries) {
    if (entry.previous !== previous) {
      return { ok: false, brokenAt: entry.sequence, reason: 'the previous hash does not match' };
    }
    const expected = hashEntry(previous, {
      sequence: entry.sequence,
      day: entry.day,
      event: entry.event,
      detail: entry.detail,
    });
    if (expected !== entry.hash) {
      return { ok: false, brokenAt: entry.sequence, reason: 'the entry does not hash to its seal' };
    }
    previous = entry.hash;
  }
  if (previous !== journal.head) {
    return {
      ok: false,
      brokenAt: journal.entries.length,
      reason: 'the head does not match the last entry',
    };
  }
  return { ok: true, brokenAt: null, reason: null };
}

export function assertSound(journal) {
  const result = verifyJournal(journal);
  if (!result.ok) {
    throw new ConfigError(
      'JOURNAL_BROKEN',
      `the journal breaks at entry ${result.brokenAt}: ${result.reason}`,
      {
        house: journal.house,
        ...result,
      }
    );
  }
  return journal;
}

export function entriesOn(journal, day) {
  return journal.entries.filter((entry) => entry.day === day);
}

export function entriesOfKind(journal, event) {
  return journal.entries.filter((entry) => entry.event === event);
}
