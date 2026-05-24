import { ConfigError } from '../core/errors.js';
import { formatBushels, formatPrice } from '../core/money.js';
import { heading, keyValue, renderTable } from '../core/text.js';
import { createContract, openLegs, priceOf, withinWindow } from '../contracts/types.js';
import { canRoll, hasFuturesLeg, rollCost } from '../contracts/roll.js';
import { priceContract } from '../contracts/pricing.js';
import { formatContract, nextContract } from '../pricing/board.js';
import { settleOf, spread } from '../pricing/quotes.js';
import { quoteFor } from '../pricing/basisbook.js';
import { readBasis, readBoard } from './desk.js';
import { applyLoad, openPosition, remainingBushels, summarise } from '../contracts/apply.js';
import { grossBushelsOf } from '../weights/ticket.js';
import { assertClean, readJsonFile, readTickets } from './desk.js';

/**
 * The contract register.
 *
 * With a ticket file it applies the day's loads first, oldest ticket first, to
 * the contract for that account and grain whose window is open. That is what
 * the office does by hand and it is the part that goes wrong: a load applied to
 * a contract whose window closed last week prices at the wrong number and
 * nobody notices until the grower's statement arrives.
 */

export function applyTickets(positions, tickets) {
  const applied = new Map(positions.map((position) => [position.contract.id, position]));
  const unapplied = [];
  for (const ticket of tickets) {
    if (ticket.direction !== 'in') continue;
    const bushels = grossBushelsOf(ticket);
    const candidates = [...applied.values()].filter(
      (position) =>
        position.contract.account === ticket.account &&
        position.contract.commodity === ticket.commodity &&
        withinWindow(position.contract, ticket.day) &&
        remainingBushels(position) > 0
    );
    if (candidates.length === 0) {
      unapplied.push({ ticket: ticket.number, account: ticket.account, bushels });
      continue;
    }
    const target = candidates.sort((a, b) =>
      a.contract.deliveryTo < b.contract.deliveryTo ? -1 : 1
    )[0];
    applied.set(
      target.contract.id,
      applyLoad(target, { ticket: ticket.number, bushels, day: ticket.day })
    );
  }
  return { positions: [...applied.values()], unapplied };
}

export function runContracts(options) {
  const document = readJsonFile(options.file, 'contract file');
  if (!Array.isArray(document.contracts)) {
    throw new ConfigError('NO_CONTRACTS', `${options.file} carries no contracts array`, {
      path: options.file,
    });
  }
  let positions = document.contracts
    .map((entry) => createContract(entry))
    .filter(
      (contract) =>
        (!options.account || contract.account === options.account) &&
        (!options.commodity || contract.commodity === options.commodity)
    )
    .map((contract) => openPosition(contract));
  if (positions.length === 0) {
    throw new ConfigError('NO_CONTRACTS', 'nothing in that file matches', {
      account: options.account ?? null,
    });
  }

  let unapplied = [];
  if (options.tickets) {
    const tickets = assertClean(readTickets(options.tickets), 'ticket');
    const result = applyTickets(positions, tickets);
    positions = result.positions;
    unapplied = result.unapplied;
  }

  const rows = positions.map((position) => {
    const summary = summarise(position);
    const price = priceOf(position.contract);
    return {
      id: summary.id,
      kind: summary.kind,
      account: summary.account,
      grain: summary.commodity,
      contracted: formatBushels(summary.contracted),
      applied: formatBushels(summary.applied),
      remaining: formatBushels(summary.remaining),
      price: price === null ? openLegs(position.contract).join('+') + ' open' : formatPrice(price),
    };
  });

  const board = options.board ? readBoard(options.board, options.day) : null;
  const basis = options.basis
    ? readBasis(options.basis, { house: 'desk', day: options.day })
    : null;
  const open = board === null ? [] : openLegReport(positions, board, basis, options);

  const lines = [
    heading('Contract register'),
    '',
    renderTable(
      [
        { header: 'contract', key: 'id' },
        { header: 'kind', key: 'kind' },
        { header: 'account', key: 'account' },
        { header: 'grain', key: 'grain' },
        { header: 'bushels', key: 'contracted', align: 'right' },
        { header: 'applied', key: 'applied', align: 'right' },
        { header: 'left', key: 'remaining', align: 'right' },
        { header: 'price', key: 'price', align: 'right' },
      ],
      rows
    ),
    '',
    keyValue([
      ['Contracts', String(rows.length)],
      [
        'Open legs',
        String(positions.filter((entry) => openLegs(entry.contract).length > 0).length),
      ],
      [
        'Still to come',
        formatBushels(positions.reduce((sum, entry) => sum + remainingBushels(entry), 0)),
      ],
    ]),
  ];

  if (open.length > 0) {
    lines.push(
      '',
      heading('what the open legs are worth today'),
      renderTable(
        [
          { header: 'contract', key: 'id' },
          { header: 'open', key: 'open' },
          { header: 'if priced now', key: 'priced', align: 'right' },
          { header: 'roll', key: 'roll' },
        ],
        open
      )
    );
  }

  if (unapplied.length > 0) {
    lines.push(
      '',
      heading('loads with no contract open'),
      unapplied
        .map((entry) => `  ${entry.ticket}  ${entry.account}  ${formatBushels(entry.bushels)}`)
        .join('\n')
    );
  }

  return { positions, unapplied, text: lines.join('\n') };
}

/**
 * What the open legs are worth if the grower prices today, and whether the
 * futures leg can still be rolled. A grower calling to ask what his hedged to
 * arrive is worth wants both numbers in the same breath.
 */
export function openLegReport(positions, board, basis, options) {
  const day = options.day ?? board.day;
  return positions
    .filter((position) => openLegs(position.contract).length > 0)
    .map((position) => {
      const contract = position.contract;
      const legs = openLegs(contract);
      let priced = 'no board for it';
      try {
        const period = options.period ?? day.slice(0, 7);
        const futuresPoints = legs.includes('futures')
          ? settleOf(board, formatContract(contract.futuresContract ?? board.quotes[0].contract))
          : contract.futuresPoints;
        const basisPoints = legs.includes('basis')
          ? basis === null
            ? null
            : quoteFor(basis, contract.commodity, period).basisPoints
          : contract.basisPoints;
        priced =
          basisPoints === null
            ? 'no basis posted'
            : formatPrice(
                priceOf(
                  priceContract(contract, {
                    day,
                    futuresPoints,
                    futuresContract: formatContract(
                      contract.futuresContract ?? board.quotes[0].contract
                    ),
                    basisPoints,
                  })
                )
              );
      } catch (error) {
        priced = error.code ?? 'cannot price it';
      }
      return {
        id: contract.id,
        open: legs.join(' and '),
        priced,
        roll: rollNote(contract, board, day),
      };
    });
}

function rollNote(contract, board, day) {
  if (!hasFuturesLeg(contract)) return 'no futures leg';
  if (!canRoll(contract, day)) return 'past first notice';
  const target = nextContract(contract.commodity, contract.futuresContract);
  try {
    const move = spread(board, formatContract(contract.futuresContract), formatContract(target));
    return `to ${formatContract(target)} for ${formatPrice(rollCost(move.points))}`;
  } catch {
    return `to ${formatContract(target)}, board has no quote`;
  }
}

export function register(program) {
  program
    .command('contracts')
    .description('print the contract register, applying a days loads if asked')
    .requiredOption('-f, --file <path>', 'the contract file')
    .option('-t, --tickets <path>', 'a scale ticket extract to apply')
    .option('--account <account>', 'only this account')
    .option('--commodity <id>', 'only this commodity')
    .option('--board <path>', 'a settlement board file, to value the open legs')
    .option('--basis <path>', 'a basis board file, to value an open basis')
    .option('--period <period>', 'the delivery period to value an open basis at')
    .option('-d, --day <day>', 'the day the boards are for')
    .action((options) => {
      console.log(runContracts(options).text);
    });
}
