import { InventoryError } from '../core/errors.js';
import { isInteger, isPlainObject, isString, nonNegative, positive } from '../core/assert.js';
import { truncate } from '../core/numbers.js';
import { bushelsFromDecimal, bushelsToDecimal, formatBushels } from '../core/money.js';
import { assertDay, compareDays } from '../core/dates.js';
import { assertCommodityId } from '../commodity/registry.js';
import { renderTable } from '../core/text.js';

/**
 * The grain bank.
 *
 * A cattle feeder hauls corn in during harvest and hauls ground feed back out
 * all winter. He is not selling and the house is not buying: the bushels sit on
 * his account and he draws against them.
 *
 * Deposits come in at settlement weight, so the house takes its shrink on the
 * way in and not on the way out. Withdrawals come out at the number on the
 * ticket. The difference between those two rules is exactly the margin the
 * bank earns and it has to be visible on the statement.
 */

export function openBankAccount(input) {
  isPlainObject(input, 'account');
  return Object.freeze({
    id: isString(input.id, 'id'),
    account: isString(input.account, 'account'),
    commodity: assertCommodityId(input.commodity),
    openedOn: assertDay(input.openedOn, 'openedOn'),
    allowOverdraft: input.allowOverdraft === true,
    entries: Object.freeze([]),
  });
}

function withEntry(bank, entry) {
  return Object.freeze({
    ...bank,
    entries: Object.freeze([...bank.entries, Object.freeze(entry)]),
  });
}

export function deposit(bank, input) {
  isPlainObject(input, 'deposit');
  const day = assertDay(input.day, 'day');
  const gross = positive(isInteger(input.bushels, 'bushels'), 'bushels');
  const shrinkPercent = nonNegative(input.shrinkPercent ?? 0, 'shrinkPercent');
  const shrink = bushelsFromDecimal(truncate((bushelsToDecimal(gross) * shrinkPercent) / 100, 2));
  return withEntry(bank, {
    kind: 'deposit',
    day,
    ticket: input.ticket === undefined ? null : isString(input.ticket, 'ticket'),
    grossBushels: gross,
    shrinkBushels: shrink,
    bushels: gross - shrink,
  });
}

export function withdraw(bank, input) {
  isPlainObject(input, 'withdrawal');
  const day = assertDay(input.day, 'day');
  const bushels = positive(isInteger(input.bushels, 'bushels'), 'bushels');
  const standing = balanceOf(bank, day);
  if (bushels > standing && !bank.allowOverdraft) {
    throw new InventoryError(
      'NOT_ENOUGH_IN_THE_BANK',
      `${bank.account} has ${formatBushels(standing)} and asked for ${formatBushels(bushels)}`,
      { account: bank.account, standing, asked: bushels }
    );
  }
  return withEntry(bank, {
    kind: 'withdrawal',
    day,
    ticket: input.ticket === undefined ? null : isString(input.ticket, 'ticket'),
    grossBushels: bushels,
    shrinkBushels: 0,
    bushels: -bushels,
  });
}

export function balanceOf(bank, asOf) {
  return bank.entries
    .filter((entry) => asOf === undefined || compareDays(entry.day, asOf) <= 0)
    .reduce((sum, entry) => sum + entry.bushels, 0);
}

export function depositedBushels(bank) {
  return bank.entries
    .filter((entry) => entry.kind === 'deposit')
    .reduce((sum, entry) => sum + entry.bushels, 0);
}

export function withdrawnBushels(bank) {
  return bank.entries
    .filter((entry) => entry.kind === 'withdrawal')
    .reduce((sum, entry) => sum + entry.grossBushels, 0);
}

/** What the house kept on the way in. This is the whole margin of the bank. */
export function shrinkKept(bank) {
  return bank.entries.reduce((sum, entry) => sum + entry.shrinkBushels, 0);
}

export function isOverdrawn(bank, asOf) {
  return balanceOf(bank, asOf) < 0;
}

export function runningEntries(bank) {
  let running = 0;
  return bank.entries.map((entry) => {
    running += entry.bushels;
    return { ...entry, balance: running };
  });
}

export function renderBank(bank, asOf) {
  const rows = runningEntries(bank).map((entry) => ({
    day: entry.day,
    kind: entry.kind,
    ticket: entry.ticket ?? '',
    gross: formatBushels(entry.grossBushels),
    shrink: entry.shrinkBushels === 0 ? '' : formatBushels(entry.shrinkBushels),
    change: formatBushels(entry.bushels),
    balance: formatBushels(entry.balance),
  }));
  const lines = [`${bank.account} grain bank in ${bank.commodity}`];
  if (rows.length === 0) {
    lines.push('Nothing has moved on this account.');
  } else {
    lines.push(
      renderTable(
        [
          { header: 'day', key: 'day' },
          { header: 'what', key: 'kind' },
          { header: 'ticket', key: 'ticket' },
          { header: 'gross', key: 'gross', align: 'right' },
          { header: 'shrink', key: 'shrink', align: 'right' },
          { header: 'change', key: 'change', align: 'right' },
          { header: 'balance', key: 'balance', align: 'right' },
        ],
        rows
      )
    );
  }
  lines.push(
    '',
    `Standing at ${formatBushels(balanceOf(bank, asOf))} bushels, ${formatBushels(shrinkKept(bank))} kept as shrink`
  );
  return lines.join('\n');
}
