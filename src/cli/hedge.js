import { ConfigError } from '../core/errors.js';
import { formatBushels, formatMoney, formatPrice } from '../core/money.js';
import { heading, keyValue, renderTable } from '../core/text.js';
import { formatContract } from '../pricing/board.js';
import { byMonth, netContracts, openLot, openLots } from '../hedging/hedge.js';
import { bookStatus } from '../hedging/marktomarket.js';
import { readBoard, readJsonFile } from './desk.js';

/**
 * The hedge book, marked against the day's settlements.
 *
 * The number the manager wants is at the bottom: whether the account is going
 * to be called before the grain ships. Everything above it is the working.
 */

export function runHedge(options) {
  const document = readJsonFile(options.file, 'hedge book');
  if (!Array.isArray(document.lots)) {
    throw new ConfigError('NO_LOTS', `${options.file} carries no lots array`, {
      path: options.file,
    });
  }
  const day = options.day ?? document.day;
  const lots = document.lots
    .map((entry) => openLot(entry))
    .filter((lot) => !options.commodity || lot.commodity === options.commodity);
  if (lots.length === 0) {
    throw new ConfigError('NO_LOTS', 'nothing in that book matches', {
      commodity: options.commodity ?? null,
    });
  }
  const board = readBoard(options.board, day);
  const cashCents = options.cash
    ? Math.round(Number(options.cash) * 100)
    : (document.cashCents ?? 0);
  const status = bookStatus(lots, board, cashCents);
  const marks = new Map(status.marks.map((mark) => [mark.id, mark]));

  const rows = openLots(lots).map((lot) => {
    const mark = marks.get(lot.id);
    return {
      id: lot.id,
      grain: lot.commodity,
      month: formatContract(lot.contract),
      side: lot.side,
      contracts: lot.contracts,
      opened: formatPrice(lot.pricePoints),
      mark: formatPrice(lot.pricePoints + (lot.side === 'short' ? -mark.points : mark.points)),
      value: formatMoney(mark.cents),
    };
  });

  const text = [
    heading(`Hedge book at ${day}`),
    '',
    renderTable(
      [
        { header: 'lot', key: 'id' },
        { header: 'grain', key: 'grain' },
        { header: 'month', key: 'month' },
        { header: 'side', key: 'side' },
        { header: 'cars', key: 'contracts', align: 'right' },
        { header: 'opened', key: 'opened', align: 'right' },
        { header: 'board', key: 'mark', align: 'right' },
        { header: 'open p and l', key: 'value', align: 'right' },
      ],
      rows
    ),
    '',
    renderTable(
      [
        { header: 'month', key: 'contract' },
        { header: 'net short', key: 'contracts', align: 'right' },
      ],
      byMonth(lots)
    ),
    '',
    keyValue([
      ['Net contracts short', String(netContracts(lots))],
      ['Bushels hedged', formatBushels(netContracts(lots) * 500_000)],
      ['Open profit and loss', formatMoney(status.unrealisedCents)],
      ['Cash in the account', formatMoney(cashCents)],
      ['Equity', formatMoney(status.equityCents)],
      ['Initial margin', formatMoney(status.initialCents)],
      ['Maintenance margin', formatMoney(status.maintenanceCents)],
      ['Standing', status.line],
    ]),
  ].join('\n');

  return { status, rows, text };
}

export function register(program) {
  program
    .command('hedge')
    .description('mark the hedge book against a board and work out the margin')
    .requiredOption('-f, --file <path>', 'the hedge book file')
    .requiredOption('--board <path>', 'a settlement board file')
    .option('-d, --day <day>', 'the day the board is for')
    .option('--cash <dollars>', 'cash in the margin account')
    .option('--commodity <id>', 'only this commodity')
    .action((options) => {
      const result = runHedge(options);
      console.log(result.text);
      if (result.status.call.called) process.exitCode = 1;
    });
}
