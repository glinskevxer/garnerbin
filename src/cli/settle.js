import { writeFileSync } from 'node:fs';
import { ConfigError } from '../core/errors.js';
import { parsePrice, formatBushels, formatMoney, formatPrice } from '../core/money.js';
import { heading, keyValue, renderTable } from '../core/text.js';
import { settleLoad } from '../settlement/settle.js';
import { statementFor } from '../settlement/statement.js';
import { bidFrom } from '../pricing/basis.js';
import { quoteFor } from '../pricing/basisbook.js';
import { settleOf } from '../pricing/quotes.js';
import { toCsv } from '../io/csv.js';
import {
  assertClean,
  readBasis,
  readBoard,
  readHouse,
  readSamples,
  readTickets,
  sampleForTicket,
  sampleIndex,
} from './desk.js';

/**
 * Settle the inbound loads on a day.
 *
 * The bid can be given straight or worked out from the board and the basis. It
 * is worth having both: the straight bid is what the office does when the desk
 * has already posted a number, and the board plus basis is what it does when it
 * has not, and having only the first is how a day gets settled against
 * yesterday's board.
 */

export function bidFor(options, commodity) {
  if (options.bid) return parsePrice(options.bid);
  if (!options.board || !options.basis || !options.period) {
    throw new ConfigError('NO_BID', 'give a bid, or a board and a basis and a period', {
      commodity,
    });
  }
  const board = readBoard(options.board, options.day);
  const book = readBasis(options.basis, { house: 'desk', day: options.day });
  const quote = quoteFor(book, commodity, options.period);
  return bidFrom(book.boards[commodity], options.period, settleOf(board, quote.contract));
}

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
    settleLoad({
      ticket,
      sample: sampleForTicket(index, ticket),
      bidPoints: bidFor(options, ticket.commodity),
      discountSchedule: house.discounts[ticket.commodity] ?? null,
      dryingSchedule: house.drying[ticket.commodity] ?? null,
      assessments: house.assessments.filter((entry) => entry.id.startsWith(ticket.commodity)),
      shrinkFactor: house.shrinkFactor,
      handlingPercent: house.handlingPercent,
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

  if (options.out) writeFileSync(options.out, settlementCsv(settlements), 'utf8');
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
  program
    .command('settle')
    .description('settle the inbound loads on a day')
    .requiredOption('-c, --house <path>', 'the house configuration file')
    .requiredOption('-t, --tickets <path>', 'a scale ticket extract')
    .requiredOption('-s, --samples <path>', 'a sample extract')
    .option('-b, --bid <price>', 'the posted bid, such as 4.2750')
    .option('--board <path>', 'a settlement board file')
    .option('--basis <path>', 'a basis board file')
    .option('--period <period>', 'the delivery period on the basis board, such as 2025-10')
    .option('-d, --day <day>', 'the day the boards are for', '2025-10-09')
    .option('--ticket <number>', 'print the full statement for one ticket')
    .option('--commodity <id>', 'only this commodity')
    .option('-o, --out <path>', 'write the settlements to a csv')
    .action((options) => {
      console.log(runSettle(options).text);
    });
}
