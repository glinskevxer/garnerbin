import { ConfigError } from '../core/errors.js';
import { parsePrice } from '../core/money.js';
import { bidFrom } from '../pricing/basis.js';
import { quoteFor } from '../pricing/basisbook.js';
import { settleOf } from '../pricing/quotes.js';
import { readBasis, readBoard } from './desk.js';

/**
 * The options four commands share, and the one piece of logic behind them.
 *
 * settle, register, book and close all need a bid, and all of them will take it
 * either as a number or as a board plus a basis plus a delivery period. They
 * used to declare those five options each, in slightly different orders with
 * slightly different help text. They declare them here now.
 */

export function addBidOptions(command) {
  return command
    .option('-b, --bid <price>', 'the posted bid, such as 4.2750')
    .option('--board <path>', 'a settlement board file')
    .option('--basis <path>', 'a basis board file')
    .option('--period <period>', 'the delivery period on the basis board, such as 2025-10')
    .option('-d, --day <day>', 'the day the boards are for');
}

export function addDeskOptions(command, { samples = true } = {}) {
  command
    .requiredOption('-c, --house <path>', 'the house configuration file')
    .requiredOption('-t, --tickets <path>', 'a scale ticket extract');
  if (samples) command.option('-s, --samples <path>', 'a sample extract, needed to settle');
  return command;
}

/**
 * The bid for one commodity. A price given straight wins; otherwise the board
 * and the basis are read and the commodity is priced off its own basis.
 */
export function bidFor(options, commodity) {
  if (options.bid) return parsePrice(options.bid);
  if (!options.board || !options.basis || !options.period) {
    throw new ConfigError('NO_BID', 'give a bid, or a board and a basis and a period', {
      commodity,
    });
  }
  if (!options.day) {
    throw new ConfigError('NO_BOARD_DAY', 'a board and a basis need the day they are for', {
      commodity,
      board: options.board,
    });
  }
  const board = readBoard(options.board, options.day);
  const book = readBasis(options.basis, { house: 'desk', day: options.day });
  const quote = quoteFor(book, commodity, options.period);
  return bidFrom(book.boards[commodity], options.period, settleOf(board, quote.contract));
}

export function wantsSettlement(options) {
  return Boolean(options.samples) && Boolean(options.bid || options.board);
}
