import { isArray, isPlainObject } from '../core/assert.js';
import { assertDay } from '../core/dates.js';
import { formatBushels, formatMoney } from '../core/money.js';
import { heading, keyValue, renderTable } from '../core/text.js';
import { toCsv } from '../io/csv.js';
import { grossBushelsOf } from '../weights/ticket.js';

/**
 * The scale ticket register.
 *
 * One line a ticket, in the order they crossed the scale, and it has to foot.
 * The office ties this to the pit tape every evening, so the totals at the
 * bottom are the point of the report and the detail above them is only there to
 * find the ticket that is wrong.
 */

export function buildRegister(input) {
  isPlainObject(input, 'register');
  const tickets = isArray(input.tickets, 'tickets');
  const settlements = new Map(
    (input.settlements ?? []).map((settlement) => [settlement.ticket, settlement])
  );
  const rows = tickets
    .slice()
    .sort((a, b) => (a.number < b.number ? -1 : 1))
    .map((ticket) => {
      const settlement = settlements.get(ticket.number);
      return {
        ticket: ticket.number,
        day: ticket.day,
        direction: ticket.direction,
        account: ticket.account,
        commodity: ticket.commodity,
        netPounds: ticket.netPounds,
        grossBushels: grossBushelsOf(ticket),
        settlementBushels: settlement ? settlement.weights.netBushels : null,
        grade: settlement ? settlement.grade.label : '',
        netCents: settlement ? settlement.netCents : null,
      };
    });
  return {
    day: assertDay(input.day, 'day'),
    house: input.house ?? 'unnamed house',
    rows,
    totals: totalsOf(rows),
  };
}

function totalsOf(rows) {
  const inbound = rows.filter((row) => row.direction === 'in');
  const outbound = rows.filter((row) => row.direction === 'out');
  const add = (list, field) => list.reduce((sum, row) => sum + (row[field] ?? 0), 0);
  return {
    tickets: rows.length,
    inbound: inbound.length,
    outbound: outbound.length,
    inboundPounds: add(inbound, 'netPounds'),
    outboundPounds: add(outbound, 'netPounds'),
    grossBushels: add(inbound, 'grossBushels'),
    settlementBushels: add(inbound, 'settlementBushels'),
    netCents: add(rows, 'netCents'),
    unsettled: rows.filter((row) => row.netCents === null).length,
  };
}

const COLUMNS = [
  { header: 'ticket', key: 'ticket' },
  { header: 'way', key: 'direction' },
  { header: 'account', key: 'account' },
  { header: 'grain', key: 'commodity' },
  { header: 'net lb', value: (row) => row.netPounds.toLocaleString('en-US'), align: 'right' },
  { header: 'gross bu', value: (row) => formatBushels(row.grossBushels), align: 'right' },
  {
    header: 'settled bu',
    value: (row) => (row.settlementBushels === null ? '' : formatBushels(row.settlementBushels)),
    align: 'right',
  },
  { header: 'grade', key: 'grade' },
  {
    header: 'net',
    value: (row) => (row.netCents === null ? '' : formatMoney(row.netCents)),
    align: 'right',
  },
];

export function renderRegister(register) {
  return [
    heading(`${register.house} ticket register ${register.day}`),
    '',
    renderTable(COLUMNS, register.rows),
    '',
    keyValue([
      [
        'Tickets',
        `${register.totals.tickets} (${register.totals.inbound} in, ${register.totals.outbound} out)`,
      ],
      ['Gross bushels in', formatBushels(register.totals.grossBushels)],
      ['Settlement bushels in', formatBushels(register.totals.settlementBushels)],
      ['Paid out', formatMoney(register.totals.netCents)],
      ['Not settled yet', String(register.totals.unsettled)],
    ]),
  ].join('\n');
}

export function registerCsv(register) {
  return toCsv(register.rows, [
    { header: 'ticket', key: 'ticket' },
    { header: 'day', key: 'day' },
    { header: 'direction', key: 'direction' },
    { header: 'account', key: 'account' },
    { header: 'commodity', key: 'commodity' },
    { header: 'netPounds', key: 'netPounds' },
    { header: 'grossBushels', value: (row) => formatBushels(row.grossBushels) },
    {
      header: 'settlementBushels',
      value: (row) => (row.settlementBushels === null ? '' : formatBushels(row.settlementBushels)),
    },
    { header: 'grade', key: 'grade' },
    {
      header: 'net',
      value: (row) => (row.netCents === null ? '' : formatMoney(row.netCents, { grouped: false })),
    },
  ]);
}
