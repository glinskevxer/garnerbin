import { ConfigError } from '../core/errors.js';
import { formatBushels, formatMoney } from '../core/money.js';
import { heading, keyValue, renderTable } from '../core/text.js';
import { verifyJournal } from '../audit/journal.js';
import { agreesWithRegister, renderReplay, replay } from '../audit/replay.js';
import { buildRegister } from '../report/register.js';
import { assertClean, readHouse, readJsonFile, readTickets } from './desk.js';

/**
 * Audit a sealed journal.
 *
 * It verifies the chain first and stops there if it is broken, because
 * everything after that would be a summary of numbers somebody may have
 * changed. Then it replays, and if it was handed a ticket file it checks the
 * journal against a register built the ordinary way.
 */

export function runAudit(options) {
  const journal = readJsonFile(options.file, 'journal');
  if (!Array.isArray(journal.entries)) {
    throw new ConfigError('NOT_A_JOURNAL', `${options.file} carries no entries array`, {
      path: options.file,
    });
  }
  const sound = verifyJournal(journal);
  if (!sound.ok) {
    return {
      sound,
      replayed: null,
      agreement: null,
      text: [
        heading('The journal does not verify'),
        keyValue([
          ['File', options.file],
          ['Breaks at entry', String(sound.brokenAt)],
          ['Because', sound.reason],
        ]),
        '',
        'Nothing below this line can be trusted, so nothing is printed.',
      ].join('\n'),
    };
  }

  const replayed = replay(journal, { through: options.through });
  const parts = [
    heading(`${journal.house} audit`),
    keyValue([
      ['File', options.file],
      ['Seal', journal.head],
      ['Verifies', 'yes'],
      ['Entries', String(replayed.entries)],
      [
        'Days',
        replayed.days.length === 0 ? 'none' : `${replayed.days[0]} to ${replayed.days.at(-1)}`,
      ],
    ]),
    '',
    renderReplay(replayed),
  ];

  if (replayed.accounts.length > 0) {
    parts.push(
      '',
      renderTable(
        [
          { header: 'account', key: 'account' },
          { header: 'loads', key: 'loads', align: 'right' },
          { header: 'paid', value: (row) => formatMoney(row.cents), align: 'right' },
        ],
        replayed.accounts
      )
    );
  }

  if (replayed.unhandled.length > 0) {
    parts.push('', `Entries this audit does not understand: ${replayed.unhandled.join(', ')}`);
  }

  let agreement = null;
  if (options.tickets) {
    const house = options.house ? readHouse(options.house) : null;
    const tickets = assertClean(readTickets(options.tickets), 'ticket');
    const day = options.day ?? replayed.days[0];
    const register = buildRegister({
      day,
      house: house?.name ?? journal.house,
      tickets: tickets.filter((ticket) => ticket.day === day),
      settlements: [],
    });
    agreement = agreesWithRegister(replayed, register);
    parts.push(
      '',
      agreement.ok
        ? `The journal agrees with the register for ${day}.`
        : [
            'The journal and the register disagree:',
            ...agreement.problems.map((why) => `  ${why}`),
          ].join('\n')
    );
    parts.push(
      keyValue([
        ['Register tickets', String(register.totals.tickets)],
        ['Register bushels in', formatBushels(register.totals.grossBushels)],
      ])
    );
  }

  return { sound, replayed, agreement, text: parts.join('\n') };
}

export function register(program) {
  program
    .command('audit')
    .description('verify a sealed journal and replay what it holds')
    .requiredOption('-f, --file <path>', 'the journal file')
    .option('-t, --tickets <path>', 'a ticket extract to check the journal against')
    .option('-c, --house <path>', 'the house configuration file')
    .option('-d, --day <day>', 'the day to check against')
    .option('--through <day>', 'replay only up to this day')
    .action((options) => {
      const result = runAudit(options);
      console.log(result.text);
      if (!result.sound.ok || result.agreement?.ok === false) process.exitCode = 1;
    });
}
