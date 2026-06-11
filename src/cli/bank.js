import { ConfigError } from '../core/errors.js';
import { formatBushels } from '../core/money.js';
import { heading, keyValue, renderTable } from '../core/text.js';
import { bushelColumn, numberColumn, textColumn } from '../report/columns.js';
import { daysBetween } from '../core/dates.js';
import {
  balanceOf,
  deposit,
  depositedBushels,
  isOverdrawn,
  openBankAccount,
  renderBank,
  shrinkKept,
  withdraw,
  withdrawnBushels,
} from '../inventory/grainbank.js';
import { issueReceipt, openBushels, openReceipts } from '../storage/receipts.js';
import { assertTakes } from '../config/house.js';
import { readHouse, readJsonFile } from './desk.js';

/**
 * The grain bank and the warehouse receipts, which are the two ways grain sits
 * in this house without the house owning it.
 *
 * They belong on one sheet because they answer the same question from two
 * directions: how much of what is in the bins is somebody else's. A feeder
 * drawing ground feed against a harvest deposit and a lender holding a receipt
 * against a bin are both claims on the same steel.
 */

export function buildAccount(entry) {
  let bank = openBankAccount({
    id: entry.id,
    account: entry.account,
    commodity: entry.commodity,
    openedOn: entry.openedOn,
    allowOverdraft: entry.allowOverdraft,
  });
  for (const move of entry.entries ?? []) {
    if (move.kind === 'deposit') {
      bank = deposit(bank, move);
    } else if (move.kind === 'withdrawal') {
      bank = withdraw(bank, move);
    } else {
      throw new ConfigError('NO_SUCH_MOVE', `${entry.id} has a ${move.kind} entry`, {
        account: entry.id,
        kind: move.kind,
      });
    }
  }
  return bank;
}

export function runBank(options) {
  const house = readHouse(options.house);
  const document = readJsonFile(options.file, 'grain bank file');
  if (!Array.isArray(document.accounts)) {
    throw new ConfigError('NO_BANK_ACCOUNTS', `${options.file} carries no accounts array`, {
      path: options.file,
    });
  }
  const asOf = options.asOf ?? document.asOf;

  const banks = document.accounts
    .filter((entry) => !options.account || entry.account === options.account)
    .map((entry) => {
      assertTakes(house, entry.commodity);
      return buildAccount(entry);
    });
  const rows = banks.map((bank) => ({
    id: bank.id,
    account: bank.account,
    commodity: bank.commodity,
    deposited: depositedBushels(bank),
    withdrawn: withdrawnBushels(bank),
    balance: balanceOf(bank, asOf),
    shrink: shrinkKept(bank),
    moves: bank.entries.length,
    overdrawn: isOverdrawn(bank, asOf),
  }));

  const receipts = (document.receipts ?? [])
    .map((entry) => issueReceipt(entry))
    .filter((receipt) => !options.account || receipt.account === options.account);

  // An account can hold receipts without holding a bank account, and the other
  // way round. Only an account with neither is a miss worth refusing.
  if (banks.length === 0 && receipts.length === 0) {
    throw new ConfigError('NOTHING_ON_THE_BANK', 'nothing in that file matches', {
      account: options.account ?? null,
    });
  }

  const parts = [heading(`${house.name} grain bank at ${asOf}`)];
  if (rows.length > 0) {
    parts.push(
      '',
      renderTable(
        [
          textColumn('account', 'account'),
          textColumn('grain', 'commodity'),
          bushelColumn('deposited', 'deposited'),
          bushelColumn('drawn', 'withdrawn'),
          bushelColumn('balance', 'balance'),
          bushelColumn('shrink kept', 'shrink'),
          numberColumn('moves', 'moves'),
        ],
        rows
      )
    );
  }

  if (options.statement) {
    const bank = banks.find((entry) => entry.account === options.statement);
    if (!bank) {
      throw new ConfigError(
        'NO_SUCH_BANK_ACCOUNT',
        `there is no bank account for ${options.statement}`,
        {
          account: options.statement,
          accounts: banks.map((entry) => entry.account),
        }
      );
    }
    parts.push('', renderBank(bank, asOf));
  }

  if (receipts.length > 0) {
    const open = openReceipts(receipts);
    parts.push(
      '',
      heading('warehouse receipts'),
      '',
      renderTable(
        [
          textColumn('receipt', 'number'),
          textColumn('holder', 'account'),
          textColumn('grain', 'commodity'),
          bushelColumn('bushels', 'bushels'),
          textColumn('bin', 'bin'),
          textColumn('issued', 'issuedOn'),
          numberColumn('days open', (receipt) => daysBetween(receipt.issuedOn, asOf)),
        ],
        open
      ),
      '',
      keyValue([
        ['Open receipts', String(open.length)],
        ['Bushels on receipt', formatBushels(openBushels(receipts))],
      ])
    );
  }

  const overdrawn = rows.filter((row) => row.overdrawn);
  parts.push(
    '',
    keyValue([
      ['Bank accounts', String(rows.length)],
      ['On the bank', formatBushels(rows.reduce((sum, row) => sum + row.balance, 0))],
      ['Kept as shrink', formatBushels(rows.reduce((sum, row) => sum + row.shrink, 0))],
      [
        'Overdrawn',
        overdrawn.length === 0 ? 'none' : overdrawn.map((row) => row.account).join(', '),
      ],
    ])
  );

  return { banks, rows, receipts, overdrawn, text: parts.join('\n') };
}

export function register(program) {
  program
    .command('bank')
    .description('read the grain bank accounts and the warehouse receipts together')
    .requiredOption('-c, --house <path>', 'the house configuration file')
    .requiredOption('-f, --file <path>', 'the grain bank file')
    .option('-a, --as-of <day>', 'read the balances at this day')
    .option('--account <account>', 'only this account')
    .option('--statement <account>', 'print the full ledger for one account')
    .action((options) => {
      const result = runBank(options);
      console.log(result.text);
      if (result.overdrawn.length > 0) process.exitCode = 1;
    });
}
