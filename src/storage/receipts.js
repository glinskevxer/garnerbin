import { ConfigError } from '../core/errors.js';
import { isArray, isInteger, isPlainObject, isString, positive } from '../core/assert.js';
import { assertDay } from '../core/dates.js';
import { formatBushels } from '../core/money.js';
import { assertCommodityId } from '../commodity/registry.js';

/**
 * Warehouse receipts.
 *
 * A receipt is a document of title. Whoever holds it owns the grain, so the
 * only three things that can happen to one are a transfer, a split and a
 * cancellation, and every one of them is recorded against the original number.
 * Nothing is ever edited in place, because the auditor is going to want the
 * chain.
 */

export function issueReceipt(input) {
  isPlainObject(input, 'receipt');
  return Object.freeze({
    number: isString(input.number, 'number'),
    account: isString(input.account, 'account'),
    commodity: assertCommodityId(input.commodity),
    bushels: positive(isInteger(input.bushels, 'bushels'), 'bushels'),
    grade: input.grade ?? null,
    bin: input.bin === undefined ? null : isString(input.bin, 'bin'),
    issuedOn: assertDay(input.issuedOn, 'issuedOn'),
    storedFrom: assertDay(input.storedFrom ?? input.issuedOn, 'storedFrom'),
    status: 'open',
    history: Object.freeze([
      Object.freeze({ event: 'issued', day: assertDay(input.issuedOn, 'issuedOn') }),
    ]),
  });
}

export function isOpen(receipt) {
  return receipt.status === 'open';
}

function assertOpen(receipt, action) {
  if (!isOpen(receipt)) {
    throw new ConfigError('RECEIPT_NOT_OPEN', `receipt ${receipt.number} is ${receipt.status}`, {
      number: receipt.number,
      status: receipt.status,
      action,
    });
  }
}

function withEvent(receipt, event) {
  return Object.freeze([...receipt.history, Object.freeze(event)]);
}

export function transferReceipt(receipt, { to, day }) {
  assertOpen(receipt, 'transfer');
  const account = isString(to, 'to');
  if (account === receipt.account) {
    throw new ConfigError('TRANSFER_TO_SELF', `${receipt.number} is already held by ${account}`, {
      number: receipt.number,
      account,
    });
  }
  return Object.freeze({
    ...receipt,
    account,
    history: withEvent(receipt, {
      event: 'transferred',
      day: assertDay(day, 'day'),
      from: receipt.account,
      to: account,
    }),
  });
}

export function splitReceipt(receipt, parts, day) {
  assertOpen(receipt, 'split');
  isArray(parts, 'parts', { minLength: 2 });
  const total = parts.reduce(
    (sum, part) => sum + positive(isInteger(part.bushels, 'bushels'), 'bushels'),
    0
  );
  if (total !== receipt.bushels) {
    throw new ConfigError(
      'SPLIT_DOES_NOT_ADD',
      `the parts add to ${formatBushels(total)}, not ${formatBushels(receipt.bushels)}`,
      {
        number: receipt.number,
        total,
        bushels: receipt.bushels,
      }
    );
  }
  const stamped = assertDay(day, 'day');
  return parts.map((part, index) =>
    Object.freeze({
      ...receipt,
      number: `${receipt.number}-${index + 1}`,
      account: part.account ?? receipt.account,
      bushels: part.bushels,
      history: withEvent(receipt, { event: 'split from', day: stamped, parent: receipt.number }),
    })
  );
}

export function cancelReceipt(receipt, { day, reason = 'loaded out' }) {
  assertOpen(receipt, 'cancel');
  return Object.freeze({
    ...receipt,
    status: 'cancelled',
    cancelledOn: assertDay(day, 'day'),
    history: withEvent(receipt, { event: 'cancelled', day: assertDay(day, 'day'), reason }),
  });
}

export function openReceipts(receipts) {
  return receipts.filter((receipt) => isOpen(receipt));
}

export function openBushels(receipts, commodity) {
  return openReceipts(receipts)
    .filter((receipt) => commodity === undefined || receipt.commodity === commodity)
    .reduce((sum, receipt) => sum + receipt.bushels, 0);
}

export function receiptsFor(receipts, account) {
  return openReceipts(receipts).filter((receipt) => receipt.account === account);
}
