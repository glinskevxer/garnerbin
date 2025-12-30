import { isArray, isPlainObject } from '../core/assert.js';
import { assertDay } from '../core/dates.js';
import { formatBushels, formatMoney } from '../core/money.js';
import { heading, keyValue, renderTable } from '../core/text.js';
import { grossBushelsOf, isInbound } from '../weights/ticket.js';
import { describeVariance, reconcile, withinTolerance } from '../weights/reconcile.js';
import { buildRegister } from './register.js';
import { appendAll, openJournal } from '../audit/journal.js';

/**
 * The end of day close.
 *
 * Everything that happened today, footed three ways: the tickets against the
 * pit tape, the bushels against the bins, and the money against what went out
 * the door. A close that does not foot is not a report, it is a question, and
 * the point of doing it every evening rather than every month is that the
 * question is still answerable while somebody remembers the day.
 */

export function closeDay(input) {
  isPlainObject(input, 'close');
  const day = assertDay(input.day, 'day');
  const tickets = isArray(input.tickets, 'tickets').filter((ticket) => ticket.day === day);
  const settlements = isArray(input.settlements ?? [], 'settlements');
  const house = input.house ?? 'unnamed house';

  const register = buildRegister({ day, house, tickets, settlements });
  const byCommodity = {};
  for (const ticket of tickets) {
    const bushels = grossBushelsOf(ticket);
    const entry = (byCommodity[ticket.commodity] ??= { received: 0, shipped: 0, loads: 0 });
    entry.loads += 1;
    if (isInbound(ticket)) entry.received += bushels;
    else entry.shipped += bushels;
  }

  const reconciliation =
    input.measured === undefined
      ? null
      : reconcile({
          opening: input.opening ?? 0,
          receipts: Object.values(byCommodity).reduce((sum, entry) => sum + entry.received, 0),
          shipments: Object.values(byCommodity).reduce((sum, entry) => sum + entry.shipped, 0),
          measured: input.measured,
        });

  const journal = appendAll(
    openJournal(house),
    tickets.map((ticket) => ({
      day,
      event: isInbound(ticket) ? 'received' : 'shipped',
      detail: {
        ticket: ticket.number,
        account: ticket.account,
        commodity: ticket.commodity,
        bushels: grossBushelsOf(ticket),
      },
    }))
  );

  return {
    day,
    house,
    register,
    byCommodity,
    reconciliation,
    journal,
    seal: journal.head,
    foots: register.totals.unsettled === 0,
    inTolerance: reconciliation === null ? null : withinTolerance(reconciliation),
  };
}

export function renderClose(close) {
  const rows = Object.entries(close.byCommodity).map(([commodity, entry]) => ({
    commodity,
    loads: entry.loads,
    received: formatBushels(entry.received),
    shipped: formatBushels(entry.shipped),
    net: formatBushels(entry.received - entry.shipped),
  }));

  const parts = [
    heading(`${close.house} close for ${close.day}`),
    '',
    renderTable(
      [
        { header: 'grain', key: 'commodity' },
        { header: 'loads', key: 'loads', align: 'right' },
        { header: 'received', key: 'received', align: 'right' },
        { header: 'shipped', key: 'shipped', align: 'right' },
        { header: 'net', key: 'net', align: 'right' },
      ],
      rows
    ),
    '',
    keyValue([
      ['Tickets', String(close.register.totals.tickets)],
      ['Settled', String(close.register.totals.tickets - close.register.totals.unsettled)],
      ['Paid out', formatMoney(close.register.totals.netCents)],
      ['Everything settled', close.foots ? 'yes' : 'no'],
    ]),
  ];

  if (close.reconciliation !== null) {
    parts.push(
      '',
      keyValue([
        ['Book', formatBushels(close.reconciliation.book)],
        ['Measured', formatBushels(close.reconciliation.measured)],
        ['Variance', describeVariance(close.reconciliation)],
        ['Inside tolerance', close.inTolerance ? 'yes' : 'no'],
      ])
    );
  }

  parts.push('', `The day seals to ${close.seal}`);
  return parts.join('\n');
}

/** Whether the close can be signed off without somebody looking at something. */
export function needsAttention(close) {
  const reasons = [];
  if (!close.foots) reasons.push(`${close.register.totals.unsettled} tickets are not settled`);
  if (close.inTolerance === false) reasons.push(describeVariance(close.reconciliation));
  return reasons;
}
