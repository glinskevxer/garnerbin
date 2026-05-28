import { formatPrice } from '../core/money.js';
import { heading, renderTable } from '../core/text.js';
import { formatBasis } from '../pricing/basis.js';
import { buildBidSheet, renderBidSheet } from '../pricing/bidsheet.js';
import { compareDestinations, createFreightRate, describeNetback } from '../pricing/freight.js';
import { priceColumn, textColumn } from '../report/columns.js';
import { toCsv } from '../io/csv.js';
import { readBasis, readBoard, readHouse, readJsonFile, writeOut } from './desk.js';

/**
 * Print the bid sheet.
 *
 * The scale house tapes this to the window every morning. It is the only place
 * the board and the basis meet before a load crosses the scale, so anything it
 * cannot price is printed underneath rather than left off, which is how a
 * commodity quietly stops being quoted for a week.
 */

export function runBids(options) {
  const house = options.house ? readHouse(options.house) : null;
  const board = readBoard(options.board, options.day);
  const basis = readBasis(options.basis, {
    house: house?.name ?? 'the house',
    day: options.day,
  });
  const sheet = buildBidSheet({
    house: house?.name ?? 'The house',
    day: options.day,
    board,
    basis,
    commodities: options.commodity ? [options.commodity] : house?.commodities,
  });
  const netbacks = options.freight ? netbackTable(options, sheet) : null;
  const parts = [renderBidSheet(sheet)];
  if (netbacks !== null) parts.push('', renderNetbacks(netbacks));
  if (options.out) writeOut(options.out, bidsCsv(sheet), 'bid sheet');
  return { sheet, netbacks, text: parts.join('\n') };
}

/**
 * What each destination nets back to the pit. The highest delivered bid is
 * frequently not the best one, which is the whole reason for printing it beside
 * the posted bids rather than on a sheet of its own.
 */
export function netbackTable(options, sheet) {
  const document = readJsonFile(options.freight, 'freight file');
  const bushels = Number(options.loadBushels ?? document.loadBushels ?? 900);
  const commodity = options.commodity ?? sheet.rows[0].commodity;
  const spot = sheet.rows.find((row) => row.commodity === commodity);
  return compareDestinations(
    (document.rates ?? []).map((entry) => ({
      rate: createFreightRate(entry),
      deliveredPoints: entry.deliveredPoints ?? spot.bidPoints + (entry.overThePitPoints ?? 2500),
    })),
    { bushels, commodity }
  );
}

export function renderNetbacks(rows) {
  return [
    heading('what each destination nets back'),
    '',
    renderTable(
      [
        textColumn('destination', 'destination'),
        priceColumn('delivered', 'deliveredPoints'),
        priceColumn('freight', 'freightPoints'),
        priceColumn('netback', 'netbackPoints'),
      ],
      rows
    ),
    '',
    describeNetback(rows[0]),
  ].join('\n');
}

export function bidsCsv(sheet) {
  return toCsv(sheet.rows, [
    { header: 'day', value: () => sheet.day },
    { header: 'commodity', key: 'commodity' },
    { header: 'period', key: 'period' },
    { header: 'month', key: 'month' },
    { header: 'board', value: (row) => formatPrice(row.settlePoints) },
    { header: 'basis', value: (row) => formatBasis(row.basisPoints) },
    { header: 'bid', value: (row) => formatPrice(row.bidPoints) },
  ]);
}

export function register(program) {
  program
    .command('bids')
    .description('print the posted bid sheet from the board and the basis')
    .requiredOption('--board <path>', 'a settlement board file')
    .requiredOption('--basis <path>', 'a basis board file')
    .requiredOption('-d, --day <day>', 'the day the boards are for')
    .option('-c, --house <path>', 'the house configuration file')
    .option('--commodity <id>', 'only this commodity')
    .option('--freight <path>', 'a freight file, to show what each destination nets back')
    .option('--load-bushels <bushels>', 'the load the freight is spread over')
    .option('-o, --out <path>', 'write the sheet to a csv')
    .action((options) => {
      const result = runBids(options);
      console.log(result.text);
      if (result.sheet.problems.length > 0) process.exitCode = 1;
    });
}
