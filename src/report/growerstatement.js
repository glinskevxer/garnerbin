import { isPlainObject } from '../core/assert.js';
import { assertDay, compareDays } from '../core/dates.js';
import { formatMoney } from '../core/money.js';
import { heading, keyValue, renderTable } from '../core/text.js';
import { balance, postingsBetween, runningBalance } from '../accounts/grower.js';
import { toCsv } from '../io/csv.js';

/**
 * The statement a grower gets at the end of the month.
 *
 * It opens with the balance carried in, lists what happened, and closes with
 * what is owed. The two balances and the movement in between have to foot, and
 * the test for that is in the file next to this one, because a statement that
 * does not foot is worse than no statement at all.
 */

export function buildGrowerStatement(ledger, options) {
  isPlainObject(options, 'options');
  const from = assertDay(options.from, 'from');
  const to = assertDay(options.to, 'to');
  if (compareDays(from, to) > 0) {
    throw new Error(`the window from ${from} to ${to} runs backwards`);
  }
  const before = ledger.postings.filter((posting) => compareDays(posting.day, from) < 0);
  const opening = before.reduce((sum, posting) => sum + posting.cents, 0);
  const inWindow = postingsBetween(ledger, from, to);
  const movement = inWindow.reduce((sum, posting) => sum + posting.cents, 0);

  let running = opening;
  const rows = inWindow.map((posting) => {
    running += posting.cents;
    return {
      day: posting.day,
      kind: posting.kind,
      reference: posting.reference ?? '',
      note: posting.note,
      amount: formatMoney(posting.cents, { sign: true }),
      cents: posting.cents,
      balance: formatMoney(running),
      balanceCents: running,
    };
  });

  return {
    house: options.house ?? 'unnamed house',
    account: ledger.account,
    from,
    to,
    openingCents: opening,
    movementCents: movement,
    closingCents: opening + movement,
    rows,
  };
}

export function renderGrowerStatement(statement) {
  const parts = [
    heading(`${statement.house} statement for ${statement.account.name}`),
    keyValue([
      ['Account', statement.account.id],
      ['Period', `${statement.from} to ${statement.to}`],
      ['Brought forward', formatMoney(statement.openingCents)],
    ]),
    '',
  ];
  if (statement.rows.length === 0) {
    parts.push('Nothing moved on this account in the period.');
  } else {
    parts.push(
      renderTable(
        [
          { header: 'day', key: 'day' },
          { header: 'what', key: 'kind' },
          { header: 'reference', key: 'reference' },
          { header: 'amount', key: 'amount', align: 'right' },
          { header: 'balance', key: 'balance', align: 'right' },
        ],
        statement.rows
      )
    );
  }
  parts.push(
    '',
    keyValue([
      ['Moved', formatMoney(statement.movementCents, { sign: true })],
      [
        statement.closingCents >= 0 ? 'Owed to you' : 'Owed to the house',
        formatMoney(Math.abs(statement.closingCents)),
      ],
    ])
  );
  return parts.join('\n');
}

export function statementCsv(statement) {
  return toCsv(statement.rows, [
    { header: 'day', key: 'day' },
    { header: 'kind', key: 'kind' },
    { header: 'reference', key: 'reference' },
    { header: 'amount', value: (row) => formatMoney(row.cents, { grouped: false, sign: false }) },
    { header: 'balance', value: (row) => formatMoney(row.balanceCents, { grouped: false }) },
  ]);
}

/** Every account with money standing on it, biggest first. */
export function payablesBook(ledgers, asOf) {
  return ledgers
    .map((ledger) => ({
      account: ledger.account.id,
      name: ledger.account.name,
      cents: balance(ledger, asOf),
      postings: ledger.postings.length,
    }))
    .filter((row) => row.cents !== 0)
    .sort((a, b) => b.cents - a.cents);
}

export function renderPayables(rows) {
  if (rows.length === 0) return 'Every account stands at nothing.';
  return [
    renderTable(
      [
        { header: 'account', key: 'account' },
        { header: 'name', key: 'name' },
        { header: 'standing', value: (row) => formatMoney(row.cents), align: 'right' },
      ],
      rows
    ),
    '',
    keyValue([
      [
        'Owed to growers',
        formatMoney(rows.filter((r) => r.cents > 0).reduce((s, r) => s + r.cents, 0)),
      ],
      [
        'Owed to the house',
        formatMoney(Math.abs(rows.filter((r) => r.cents < 0).reduce((s, r) => s + r.cents, 0))),
      ],
    ]),
  ].join('\n');
}

export { runningBalance };
