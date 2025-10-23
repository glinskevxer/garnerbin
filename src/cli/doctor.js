import { heading, keyValue, renderTable } from '../core/text.js';
import { monthKey } from '../core/dates.js';
import { formatContract } from '../pricing/board.js';
import { openLot } from '../hedging/hedge.js';
import { createContract } from '../contracts/types.js';
import { periodsFor } from '../pricing/basisbook.js';
import { readBasis, readBoard, readHouse, readJsonFile, readSamples, readTickets } from './desk.js';

/**
 * Read every file the desk has and report where they disagree with each other.
 *
 * The individual commands each validate their own inputs. Nothing else looks at
 * two files at once, and that is where the real mistakes live: a ticket for a
 * bin that was taken out of the house file last spring, a hedge in a month the
 * board extract does not carry, a sample for a load that never came.
 */

function finding(severity, code, message) {
  return { severity, code, message };
}

export function runDoctor(options) {
  const house = readHouse(options.house);
  const findings = [];
  const checked = ['house'];

  for (const commodity of house.commodities) {
    if (!house.discounts[commodity]) {
      findings.push(
        finding(
          'warn',
          'NO_DISCOUNTS',
          `${house.name} takes ${commodity} and posts no discount schedule`
        )
      );
    }
  }

  let tickets = [];
  if (options.tickets) {
    const read = readTickets(options.tickets);
    tickets = read.records;
    checked.push('tickets');
    for (const problem of read.problems) {
      findings.push(
        finding('stop', 'BAD_TICKET_ROW', `ticket row ${problem.row}: ${problem.message}`)
      );
    }
    const bins = new Set(house.bins.map((bin) => bin.id));
    for (const ticket of tickets) {
      if (ticket.bin && !bins.has(ticket.bin)) {
        findings.push(finding('stop', 'NO_SUCH_BIN', `${ticket.number} names bin ${ticket.bin}`));
      }
      if (!house.commodities.includes(ticket.commodity)) {
        findings.push(
          finding('stop', 'COMMODITY_NOT_TAKEN', `${ticket.number} is ${ticket.commodity}`)
        );
      }
    }
  }

  if (options.samples) {
    const read = readSamples(options.samples);
    checked.push('samples');
    for (const problem of read.problems) {
      findings.push(
        finding('stop', 'BAD_SAMPLE_ROW', `sample row ${problem.row}: ${problem.message}`)
      );
    }
    const ids = new Set(read.records.map((sample) => sample.id));
    const named = new Set(tickets.map((ticket) => ticket.sampleId).filter(Boolean));
    for (const ticket of tickets.filter((entry) => entry.direction === 'in')) {
      if (!ticket.sampleId) {
        findings.push(finding('stop', 'NO_SAMPLE_NAMED', `${ticket.number} names no sample`));
      } else if (!ids.has(ticket.sampleId)) {
        findings.push(
          finding(
            'stop',
            'SAMPLE_MISSING',
            `${ticket.number} names ${ticket.sampleId}, which is not in the file`
          )
        );
      }
    }
    for (const sample of read.records) {
      if (!named.has(sample.id)) {
        findings.push(finding('note', 'ORPHAN_SAMPLE', `${sample.id} belongs to no ticket here`));
      }
      if (!house.commodities.includes(sample.commodity)) {
        findings.push(
          finding(
            'warn',
            'SAMPLE_NOT_TAKEN',
            `${sample.id} is ${sample.commodity}, which this house does not take`
          )
        );
      }
    }
  }

  if (options.contracts) {
    const document = readJsonFile(options.contracts, 'contract file');
    const contracts = (document.contracts ?? []).map((entry) => createContract(entry));
    checked.push('contracts');
    const accounts = new Set(contracts.map((contract) => contract.account));
    for (const account of new Set(
      tickets.filter((t) => t.direction === 'in').map((t) => t.account)
    )) {
      if (!accounts.has(account)) {
        findings.push(
          finding('note', 'NO_CONTRACT', `${account} delivered with no contract on file`)
        );
      }
    }
    for (const contract of contracts) {
      if (!house.commodities.includes(contract.commodity)) {
        findings.push(
          finding('warn', 'CONTRACT_NOT_TAKEN', `${contract.id} is for ${contract.commodity}`)
        );
      }
    }
  }

  if (options.board && options.hedge) {
    const board = readBoard(options.board, options.day ?? tickets[0]?.day ?? '2025-10-09');
    const document = readJsonFile(options.hedge, 'hedge book');
    checked.push('board', 'hedge');
    const onBoard = new Set(board.quotes.map((quote) => quote.key));
    for (const entry of document.lots ?? []) {
      const lot = openLot(entry);
      const month = formatContract(lot.contract);
      if (!onBoard.has(month)) {
        findings.push(
          finding(
            'stop',
            'MONTH_NOT_ON_BOARD',
            `${lot.id} is in ${month} and the board does not carry it`
          )
        );
      }
    }
  }

  if (options.basis && tickets.length > 0) {
    const day = options.day ?? tickets[0].day;
    const book = readBasis(options.basis, { house: house.name, day });
    checked.push('basis');
    for (const commodity of house.commodities) {
      if (!book.boards[commodity]) {
        findings.push(finding('warn', 'NO_BASIS_POSTED', `no basis is posted for ${commodity}`));
        continue;
      }
      const periods = new Set(periodsFor(book, commodity));
      if (!periods.has(monthKey(day))) {
        findings.push(
          finding(
            'warn',
            'NO_BASIS_FOR_DAY',
            `the ${commodity} basis does not quote ${monthKey(day)}`
          )
        );
      }
    }
  }

  const counts = { stop: 0, warn: 0, note: 0 };
  for (const entry of findings) counts[entry.severity] += 1;

  const text = [
    heading(`${house.name} doctor`),
    keyValue([
      ['Read', checked.join(', ')],
      ['Stops', String(counts.stop)],
      ['Warnings', String(counts.warn)],
      ['Notes', String(counts.note)],
    ]),
    '',
    findings.length === 0
      ? 'Every file agrees with every other one.'
      : renderTable(
          [
            { header: 'level', key: 'severity' },
            { header: 'what', key: 'code' },
            { header: 'where', key: 'message' },
          ],
          findings
        ),
  ].join('\n');

  return { findings, counts, checked, text };
}

export function register(program) {
  program
    .command('doctor')
    .description('read every file together and report where they disagree')
    .requiredOption('-c, --house <path>', 'the house configuration file')
    .option('-t, --tickets <path>', 'a scale ticket extract')
    .option('-s, --samples <path>', 'a sample extract')
    .option('--contracts <path>', 'a contract file')
    .option('--hedge <path>', 'a hedge book file')
    .option('--board <path>', 'a settlement board file')
    .option('--basis <path>', 'a basis board file')
    .option('-d, --day <day>', 'the day the boards are for')
    .action((options) => {
      const result = runDoctor(options);
      console.log(result.text);
      if (result.counts.stop > 0) process.exitCode = 1;
    });
}
