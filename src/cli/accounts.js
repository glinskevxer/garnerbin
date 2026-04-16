import { ConfigError } from '../core/errors.js';
import { heading, keyValue } from '../core/text.js';
import { createAccount, openLedger, postAll } from '../accounts/grower.js';
import {
  buildGrowerStatement,
  payablesBook,
  renderGrowerStatement,
  renderPayables,
  statementCsv,
} from '../report/growerstatement.js';
import { readJsonFile, writeOut } from './desk.js';

/**
 * Grower accounts, from the file the office keeps them in.
 *
 * With an account it prints that grower's statement. Without one it prints the
 * payables book, which is the number the manager and the lender both want and
 * which nothing else in here produces.
 */

export function loadLedgers(document) {
  if (!Array.isArray(document.accounts)) {
    throw new ConfigError('NO_ACCOUNTS', 'the accounts file carries no accounts array', {});
  }
  const ledgers = new Map();
  for (const entry of document.accounts) {
    const account = createAccount(entry);
    if (ledgers.has(account.id)) {
      throw new ConfigError('DUPLICATE_ACCOUNT', `${account.id} is in the file twice`, {
        account: account.id,
      });
    }
    ledgers.set(account.id, openLedger(account));
  }
  const byAccount = new Map();
  for (const posting of document.postings ?? []) {
    if (!ledgers.has(posting.account)) {
      throw new ConfigError(
        'POSTING_WITHOUT_ACCOUNT',
        `a posting names ${posting.account}, which has no account`,
        {
          account: posting.account,
          reference: posting.reference ?? null,
        }
      );
    }
    if (!byAccount.has(posting.account)) byAccount.set(posting.account, []);
    byAccount.get(posting.account).push(posting);
  }
  for (const [id, postings] of byAccount) {
    ledgers.set(id, postAll(ledgers.get(id), postings));
  }
  return [...ledgers.values()];
}

export function runAccounts(options) {
  const ledgers = loadLedgers(readJsonFile(options.file, 'accounts file'));

  if (options.account) {
    const ledger = ledgers.find((entry) => entry.account.id === options.account);
    if (!ledger) {
      throw new ConfigError('NO_SUCH_ACCOUNT', `there is no account ${options.account}`, {
        account: options.account,
        accounts: ledgers.map((entry) => entry.account.id),
      });
    }
    const days = ledger.postings.map((posting) => posting.day).sort();
    const statement = buildGrowerStatement(ledger, {
      from: options.from ?? days[0] ?? '2025-01-01',
      to: options.to ?? days.at(-1) ?? '2025-12-31',
      house: options.houseName ?? 'Rush Creek Grain',
    });
    if (options.out) writeOut(options.out, statementCsv(statement), 'statement');
    return { statement, text: renderGrowerStatement(statement) };
  }

  const rows = payablesBook(ledgers, options.asOf);
  const text = [
    heading(`Payables${options.asOf ? ` at ${options.asOf}` : ''}`),
    keyValue([
      ['Accounts', String(ledgers.length)],
      ['With money on them', String(rows.length)],
    ]),
    '',
    renderPayables(rows),
  ].join('\n');
  return { rows, ledgers, text };
}

export function register(program) {
  program
    .command('accounts')
    .description('print the payables book, or one growers statement')
    .requiredOption('-f, --file <path>', 'the accounts file')
    .option('--account <id>', 'print this growers statement')
    .option('--from <day>', 'the first day of the statement period', '2025-10-01')
    .option('--to <day>', 'the last day of the statement period', '2025-10-31')
    .option('-a, --as-of <day>', 'read the payables book at this day')
    .option('-o, --out <path>', 'write the statement to a csv')
    .action((options) => {
      console.log(runAccounts(options).text);
    });
}
