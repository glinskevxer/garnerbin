import { ConfigError } from '../core/errors.js';
import { formatBushels, formatMoney, formatPrice } from '../core/money.js';
import { heading, keyValue, renderTable } from '../core/text.js';
import { settleAgainstHouse } from '../settlement/day.js';
import { statementFor } from '../settlement/statement.js';
import { toCsv } from '../io/csv.js';
import { sampleForTicket, sampleIndex } from '../grading/sample.js';
import { addBidOptions, addDeskOptions, bidFor } from './options.js';
import { assertClean, readHouse, readSamples, readTickets, writeOut } from './desk.js';

/**
 * Settle the inbound loads on a day.
 *
 * The bid comes from options.js, which takes it either as a posted number or as
 * a board and a basis and a period.
 */

export function runSettle(options) {
  const house = readHouse(options.house);
  const tickets = assertClean(readTickets(options.tickets), 'ticket');
  const samples = assertClean(readSamples(options.samples), 'sample');
  const index = sampleIndex(samples);

  const wanted = tickets.filter(
    (ticket) =>
      ticket.direction === 'in' &&
      (!options.ticket || ticket.number === options.ticket) &&
      (!options.commodity || ticket.commodity === options.commodity)
  );
  if (wanted.length === 0) {
    throw new ConfigError('NOTHING_TO_SETTLE', 'no inbound ticket in that file matches', {
      ticket: options.ticket ?? null,
    });
  }

  const settlements = wanted.map((ticket) =>
    settleAgainstHouse(house, {
      ticket,
      sample: sampleForTicket(index, ticket),
      bidPoints: bidFor(options, ticket.commodity),
    })
  );

  if (options.ticket) {
    return { settlements, text: statementFor(settlements[0], { house: house.name }) };
  }

  const rows = settlements.map((settlement) => ({
    ticket: settlement.ticket,
    account: settlement.account,
    grain: settlement.commodity,
    grade: settlement.grade.label,
    gross: formatBushels(settlement.weights.grossBushels),
    settled: formatBushels(settlement.weights.netBushels),
    price: formatPrice(settlement.netPricePoints),
    drying: settlement.drying.cents === 0 ? '' : formatMoney(settlement.drying.cents),
    net: formatMoney(settlement.netCents),
  }));

  const totals = {
    loads: settlements.length,
    gross: settlements.reduce((sum, entry) => sum + entry.weights.grossBushels, 0),
    settled: settlements.reduce((sum, entry) => sum + entry.weights.netBushels, 0),
    drying: settlements.reduce((sum, entry) => sum + entry.drying.cents, 0),
    net: settlements.reduce((sum, entry) => sum + entry.netCents, 0),
  };

  const text = [
    heading(`${house.name} settlements`),
    '',
    renderTable(
      [
        { header: 'ticket', key: 'ticket' },
        { header: 'account', key: 'account' },
        { header: 'grade', key: 'grade' },
        { header: 'gross bu', key: 'gross', align: 'right' },
        { header: 'settled bu', key: 'settled', align: 'right' },
        { header: 'price', key: 'price', align: 'right' },
        { header: 'drying', key: 'drying', align: 'right' },
        { header: 'net', key: 'net', align: 'right' },
      ],
      rows
    ),
    '',
    keyValue([
      ['Loads', String(totals.loads)],
      ['Gross bushels', formatBushels(totals.gross)],
      ['Settlement bushels', formatBushels(totals.settled)],
      ['Shrink and dockage', formatBushels(totals.gross - totals.settled)],
      ['Drying charged', formatMoney(totals.drying)],
      ['Paid out', formatMoney(totals.net)],
    ]),
  ].join('\n');

  if (options.out) writeOut(options.out, settlementCsv(settlements), 'settlements');
  return { settlements, totals, text };
}

export function settlementCsv(settlements) {
  return toCsv(settlements, [
    { header: 'ticket', key: 'ticket' },
    { header: 'day', key: 'day' },
    { header: 'account', key: 'account' },
    { header: 'commodity', key: 'commodity' },
    { header: 'grade', value: (entry) => entry.grade.label },
    { header: 'grossBushels', value: (entry) => formatBushels(entry.weights.grossBushels) },
    { header: 'settlementBushels', value: (entry) => formatBushels(entry.weights.netBushels) },
    { header: 'netPrice', value: (entry) => formatPrice(entry.netPricePoints) },
    { header: 'dryingCents', value: (entry) => entry.drying.cents },
    { header: 'net', value: (entry) => formatMoney(entry.netCents, { grouped: false }) },
  ]);
}

export function register(program) {
  const command = program.command('settle').description('settle the inbound loads on a day');
  addDeskOptions(command);
  addBidOptions(command)
    .option('--ticket <number>', 'print the full statement for one ticket')
    .option('--commodity <id>', 'only this commodity')
    .option('-o, --out <path>', 'write the settlements to a csv')
    .action((options) => {
      console.log(runSettle(options).text);
    });
}
