import { readFileSync } from 'node:fs';
import { ConfigError } from '../core/errors.js';
import { isString } from '../core/assert.js';
import { loadHouse } from '../config/house.js';
import {
  importBasisBook,
  importQuoteBoard,
  importSamples,
  importTickets,
} from '../io/importers.js';

/**
 * Reading the files a command was pointed at.
 *
 * Every read goes through here so a missing file, a file that is not json and a
 * file that is json but the wrong shape all come back as the same kind of
 * coded error with the path in it. The commands themselves never touch the
 * filesystem.
 */

export function readText(path, what) {
  isString(path, 'path');
  try {
    return readFileSync(path, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') {
      throw new ConfigError('FILE_NOT_FOUND', `no ${what} at ${path}`, { path, what });
    }
    throw error;
  }
}

export function readJsonFile(path, what) {
  const text = readText(path, what);
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new ConfigError('BAD_JSON_FILE', `${path} is not valid json: ${error.message}`, { path });
  }
}

export function readHouse(path) {
  return loadHouse(readJsonFile(path, 'house file'));
}

export function readTickets(path) {
  return importTickets(readText(path, 'ticket file'));
}

export function readSamples(path) {
  return importSamples(readText(path, 'sample file'));
}

export function readBoard(path, day) {
  return importQuoteBoard(readText(path, 'board file'), day);
}

export function readBasis(path, { house, day }) {
  return importBasisBook(readText(path, 'basis file'), { house, day });
}

/** Index samples by id so a ticket can find the one that belongs to it. */
export function sampleIndex(samples) {
  return new Map(samples.map((sample) => [sample.id, sample]));
}

export function sampleForTicket(index, ticket) {
  if (!ticket.sampleId) {
    throw new ConfigError('TICKET_HAS_NO_SAMPLE', `${ticket.number} names no sample`, {
      ticket: ticket.number,
    });
  }
  const sample = index.get(ticket.sampleId);
  if (!sample) {
    throw new ConfigError(
      'SAMPLE_NOT_FOUND',
      `${ticket.number} names sample ${ticket.sampleId}, which is not in the file`,
      {
        ticket: ticket.number,
        sample: ticket.sampleId,
      }
    );
  }
  return sample;
}

/** Refuse to work from an import that had rows it could not build. */
export function assertClean(result, what) {
  if (result.problems.length > 0) {
    const detail = result.problems.map((problem) => `row ${problem.row}: ${problem.message}`);
    throw new ConfigError('IMPORT_HAS_PROBLEMS', `the ${what} file has ${detail.length} bad rows`, {
      what,
      problems: detail,
    });
  }
  return result.records;
}
