import { ConfigError } from '../core/errors.js';
import { formatBushels, formatMoney } from '../core/money.js';
import { heading, keyValue, renderTable } from '../core/text.js';
import { assertDay } from '../core/dates.js';
import { ageLots, storageCharge } from '../storage/accrual.js';
import { readHouse, readJsonFile } from './desk.js';

/**
 * Storage charges and the aging of what is in open storage.
 *
 * The aging table is the one the manager reads: a bin full of grain that has
 * been sitting since October is earning rent, and a bin full of grain that came
 * in last week is not. The charge column is what actually gets billed when the
 * grower prices it.
 */

export function runStorage(options) {
  const house = readHouse(options.house);
  if (!house.storage) {
    throw new ConfigError('NO_STORAGE_TERMS', `${house.name} posts no storage terms`, {
      house: house.name,
    });
  }
  const document = readJsonFile(options.file, 'lot file');
  if (!Array.isArray(document.lots)) {
    throw new ConfigError('NO_LOTS', `${options.file} carries no lots array`, {
      path: options.file,
    });
  }
  const asOf = assertDay(options.asOf ?? document.asOf, 'asOf');
  const lots = document.lots.filter(
    (lot) =>
      (!options.account || lot.account === options.account) &&
      (!options.commodity || lot.commodity === options.commodity)
  );
  if (lots.length === 0) {
    throw new ConfigError('NO_LOTS', 'nothing in that file matches', {
      account: options.account ?? null,
      commodity: options.commodity ?? null,
    });
  }

  const rows = lots.map((lot) => {
    const charge = storageCharge(house.storage, {
      bushelHundredths: lot.bushels,
      storedFrom: lot.storedFrom,
      asOf,
    });
    return {
      lot: lot.id,
      account: lot.account,
      commodity: lot.commodity,
      bushels: formatBushels(lot.bushels),
      storedFrom: lot.storedFrom,
      days: charge.days,
      charge: formatMoney(charge.cents),
      cents: charge.cents,
      raw: lot,
    };
  });

  const aging = ageLots(
    lots.map((lot) => ({ storedFrom: lot.storedFrom, bushels: lot.bushels })),
    asOf
  );
  const total = rows.reduce((sum, row) => sum + row.cents, 0);
  const bushels = lots.reduce((sum, lot) => sum + lot.bushels, 0);

  const text = [
    heading(`${house.name} open storage at ${asOf}`),
    '',
    renderTable(
      [
        { header: 'lot', key: 'lot' },
        { header: 'account', key: 'account' },
        { header: 'grain', key: 'commodity' },
        { header: 'bushels', key: 'bushels', align: 'right' },
        { header: 'in since', key: 'storedFrom' },
        { header: 'days', key: 'days', align: 'right' },
        { header: 'charge', key: 'charge', align: 'right' },
      ],
      rows
    ),
    '',
    renderTable(
      [
        { header: 'age', key: 'bucket' },
        { header: 'bushels', value: (row) => formatBushels(row.bushels), align: 'right' },
      ],
      aging
    ),
    '',
    keyValue([
      ['Lots', String(rows.length)],
      ['Bushels', formatBushels(bushels)],
      ['Charges accrued', formatMoney(total)],
      ['Rent starts', house.storage.freeUntil ?? 'the day it comes in'],
    ]),
  ].join('\n');

  return { rows, aging, totalCents: total, text };
}

export function register(program) {
  program
    .command('storage')
    .description('age the open storage lots and work out what they have accrued')
    .requiredOption('-c, --house <path>', 'the house configuration file')
    .requiredOption('-f, --file <path>', 'the open storage lot file')
    .option('-a, --as-of <day>', 'the day to work it out at')
    .option('--account <account>', 'only this account')
    .option('--commodity <id>', 'only this commodity')
    .action((options) => {
      console.log(runStorage(options).text);
    });
}
