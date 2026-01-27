import { writeFileSync } from 'node:fs';
import { formatPrice } from '../core/money.js';
import { formatBasis } from '../pricing/basis.js';
import { buildBidSheet, renderBidSheet } from '../pricing/bidsheet.js';
import { toCsv } from '../io/csv.js';
import { readBasis, readBoard, readHouse } from './desk.js';

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
  if (options.out) writeFileSync(options.out, bidsCsv(sheet), 'utf8');
  return { sheet, text: renderBidSheet(sheet) };
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
    .option('-o, --out <path>', 'write the sheet to a csv')
    .action((options) => {
      const result = runBids(options);
      console.log(result.text);
      if (result.sheet.problems.length > 0) process.exitCode = 1;
    });
}
