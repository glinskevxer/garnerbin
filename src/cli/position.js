import { ConfigError } from '../core/errors.js';
import { formatBushels } from '../core/money.js';
import { buildPosition } from '../inventory/position.js';
import { buildDpr, renderDpr, unhedgedExceeds } from '../inventory/dpr.js';
import { readHouse, readJsonFile } from './desk.js';

/**
 * The daily position.
 *
 * The file it reads is the one the office keeps by hand, because the numbers on
 * it come from four different places and no single system in this house has all
 * of them. What this does is the arithmetic, consistently, and shouts when the
 * unhedged column goes past what the lender allows.
 */

export function runPosition(options) {
  const document = readJsonFile(options.file, 'position file');
  if (!Array.isArray(document.positions)) {
    throw new ConfigError('NO_POSITIONS', `${options.file} carries no positions array`, {
      path: options.file,
    });
  }
  const house = options.house ? readHouse(options.house) : null;
  const positions = document.positions
    .filter((entry) => !options.commodity || entry.commodity === options.commodity)
    .map((entry) => buildPosition(entry));
  if (positions.length === 0) {
    throw new ConfigError('NO_POSITIONS', 'nothing in that file matches', {
      commodity: options.commodity ?? null,
    });
  }
  const report = buildDpr({
    day: options.day ?? document.day,
    house: house?.name ?? document.house,
    positions,
  });
  const limit = options.limit ? Number(options.limit) * 100 : null;
  const over = limit === null ? false : unhedgedExceeds(report, limit);
  const lines = [renderDpr(report)];
  if (limit !== null) {
    lines.push(
      '',
      over
        ? `OVER THE COVENANT: ${formatBushels(report.totals.unhedged)} against a limit of ${formatBushels(limit)}`
        : `Inside the covenant of ${formatBushels(limit)}`
    );
  }
  return { report, over, text: lines.join('\n') };
}

export function register(program) {
  program
    .command('position')
    .description('print the daily position report from the position file')
    .requiredOption('-f, --file <path>', 'the position file')
    .option('-c, --house <path>', 'the house configuration file')
    .option('-d, --day <day>', 'override the day on the file')
    .option('--commodity <id>', 'only this commodity')
    .option('--limit <bushels>', 'the unhedged covenant, in bushels')
    .action((options) => {
      const result = runPosition(options);
      console.log(result.text);
      if (result.over) process.exitCode = 1;
    });
}
