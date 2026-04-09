import { ConfigError } from '../core/errors.js';
import { formatBushels } from '../core/money.js';
import { heading, keyValue } from '../core/text.js';
import { daysUntilFull, planFor, renderSpace } from '../inventory/space.js';
import { binOf, readHouse, readJsonFile } from './desk.js';

/**
 * Space before harvest.
 *
 * It runs on the house file and a holdings file, so the bins it counts are the
 * bins the house actually has rather than a list somebody typed into a
 * spreadsheet two seasons ago.
 */

export function runSpace(options) {
  const house = readHouse(options.house);
  const document = readJsonFile(options.file, 'holdings file');
  if (!Array.isArray(document.holdings)) {
    throw new ConfigError('NO_HOLDINGS', `${options.file} carries no holdings array`, {
      path: options.file,
    });
  }
  const holdings = document.holdings.map((entry) => ({
    bin: binOf(house, entry.bin),
    bushels: entry.bushels ?? 0,
    commodity: entry.commodity ?? null,
  }));

  const commodities = options.commodity
    ? [options.commodity]
    : Object.keys(document.expected ?? {}).length > 0
      ? Object.keys(document.expected)
      : house.commodities;

  const plans = commodities.map((commodity) => {
    const expected =
      options.expected !== undefined
        ? Math.round(Number(options.expected) * 100)
        : (document.expected?.[commodity] ?? 0);
    return planFor({ commodity, holdings, expectedBushels: expected });
  });

  const parts = [heading(`${house.name} space at ${options.day ?? document.day ?? 'today'}`)];
  for (const plan of plans) {
    parts.push('', renderSpace(plan));
    if (options.daily) {
      parts.push(
        keyValue([
          [
            'Days of room',
            `${daysUntilFull(plan.freeBushels, Math.round(Number(options.daily) * 100))}`,
          ],
        ])
      );
    }
  }
  parts.push(
    '',
    keyValue([
      ['Grains planned', plans.map((plan) => plan.commodity).join(', ')],
      [
        'Short on',
        plans
          .filter((plan) => !plan.enough)
          .map((plan) => plan.commodity)
          .join(', ') || 'nothing',
      ],
      ['Total short', formatBushels(plans.reduce((sum, plan) => sum + plan.shortBushels, 0))],
    ])
  );

  return { plans, text: parts.join('\n') };
}

export function register(program) {
  program
    .command('space')
    .description('work out whether there is room for the crop that is coming')
    .requiredOption('-c, --house <path>', 'the house configuration file')
    .requiredOption('-f, --file <path>', 'the holdings file')
    .option('--commodity <id>', 'only this commodity')
    .option('--expected <bushels>', 'override what is expected')
    .option('--daily <bushels>', 'a days receipts, to say how long the room lasts')
    .option('-d, --day <day>', 'the day to label the sheet')
    .action((options) => {
      const result = runSpace(options);
      console.log(result.text);
      if (result.plans.some((plan) => !plan.enough)) process.exitCode = 1;
    });
}
