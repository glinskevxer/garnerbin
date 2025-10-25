import { ConfigError } from '../core/errors.js';
import { isInteger, isPlainObject, isString, oneOf } from '../core/assert.js';
import { assertDay, compareDays, isWithin } from '../core/dates.js';
import { formatMoney } from '../core/money.js';

/**
 * Grower accounts.
 *
 * A settlement does not always end in a cheque. Grain goes on the account, the
 * house takes storage and drying off it, the grower draws an advance against
 * it, and the balance is what is owed either way at any moment.
 *
 * Signs are fixed once here and never argued about again: a positive amount is
 * money the house owes the grower. Everything the house charges is negative.
 */

export const POSTING_KINDS = Object.freeze([
  'settlement',
  'advance',
  'storage',
  'drying',
  'service',
  'payment',
  'adjustment',
]);

const SIGN = {
  settlement: 1,
  advance: -1,
  storage: -1,
  drying: -1,
  service: -1,
  payment: -1,
  adjustment: 1,
};

export function createAccount(input) {
  isPlainObject(input, 'account');
  return Object.freeze({
    id: isString(input.id, 'id'),
    name: isString(input.name, 'name'),
    address: input.address === undefined ? null : isString(input.address, 'address'),
    since: input.since === undefined ? null : assertDay(input.since, 'since'),
    active: input.active !== false,
  });
}

export function openLedger(account) {
  return Object.freeze({ account, postings: Object.freeze([]) });
}

/**
 * Post an amount. The caller gives the size and the kind decides the sign, so
 * nobody can accidentally post a storage charge that pays the grower.
 */
export function post(ledger, entry) {
  isPlainObject(entry, 'posting');
  if (!ledger.account.active) {
    throw new ConfigError('ACCOUNT_CLOSED', `${ledger.account.id} is closed`, {
      account: ledger.account.id,
    });
  }
  const kind = oneOf(entry.kind, 'kind', POSTING_KINDS);
  const size = isInteger(entry.cents, 'cents');
  if (size < 0) {
    throw new ConfigError('NEGATIVE_POSTING', 'post the size and let the kind set the sign', {
      kind,
      cents: size,
    });
  }
  const posting = Object.freeze({
    day: assertDay(entry.day, 'day'),
    kind,
    reference: entry.reference === undefined ? null : isString(entry.reference, 'reference'),
    cents: size * SIGN[kind],
    note: entry.note ?? '',
  });
  return Object.freeze({
    account: ledger.account,
    postings: Object.freeze([...ledger.postings, posting]),
  });
}

export function postAll(ledger, entries) {
  return entries.reduce((current, entry) => post(current, entry), ledger);
}

export function balance(ledger, asOf) {
  return ledger.postings
    .filter((posting) => asOf === undefined || compareDays(posting.day, asOf) <= 0)
    .reduce((sum, posting) => sum + posting.cents, 0);
}

export function owedToGrower(ledger, asOf) {
  return Math.max(0, balance(ledger, asOf));
}

export function owedToHouse(ledger, asOf) {
  return Math.max(0, -balance(ledger, asOf));
}

export function postingsBetween(ledger, from, to) {
  return ledger.postings.filter((posting) => isWithin(posting.day, from, to));
}

export function totalsByKind(ledger) {
  const totals = Object.fromEntries(POSTING_KINDS.map((kind) => [kind, 0]));
  for (const posting of ledger.postings) totals[posting.kind] += posting.cents;
  return totals;
}

/** A running balance, which is what the grower reads down the page. */
export function runningBalance(ledger) {
  let running = 0;
  return ledger.postings.map((posting) => {
    running += posting.cents;
    return { ...posting, balance: running, amount: formatMoney(posting.cents, { sign: true }) };
  });
}

export function closeAccount(ledger, day) {
  const standing = balance(ledger);
  if (standing !== 0) {
    throw new ConfigError(
      'BALANCE_NOT_ZERO',
      `${ledger.account.id} still stands at ${formatMoney(standing)}`,
      {
        account: ledger.account.id,
        cents: standing,
      }
    );
  }
  return Object.freeze({
    ...ledger,
    account: Object.freeze({ ...ledger.account, active: false, closedOn: assertDay(day, 'day') }),
  });
}
