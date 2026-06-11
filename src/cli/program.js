import { Command } from 'commander';
import { isGarnerbinError } from '../core/errors.js';
import { register as registerAccounts } from './accounts.js';
import { register as registerAudit } from './audit.js';
import { register as registerBank } from './bank.js';
import { register as registerBids } from './bids.js';
import { register as registerBins } from './bins.js';
import { register as registerBlend } from './blend.js';
import { register as registerBook } from './book.js';
import { register as registerCars } from './cars.js';
import { register as registerClose } from './close.js';
import { register as registerContracts } from './contracts.js';
import { register as registerDoctor } from './doctor.js';
import { register as registerExceptions } from './exceptions.js';
import { register as registerGrade } from './grade.js';
import { register as registerHaulers } from './haulers.js';
import { register as registerHedge } from './hedge.js';
import { register as registerPosition } from './position.js';
import { register as registerQueue } from './queue.js';
import { register as registerRegister } from './register.js';
import { register as registerSeason } from './season.js';
import { register as registerSettle } from './settle.js';
import { register as registerShip } from './ship.js';
import { register as registerSpace } from './space.js';
import { register as registerStorage } from './storage.js';
import { register as registerValidate } from './validate.js';

/**
 * The command line.
 *
 * Every command reads files, works something out and prints it. Nothing here
 * writes to the office data by itself: a command that changes something takes
 * an explicit output path, so running one twice cannot quietly do a thing
 * twice.
 */

export function buildProgram(version) {
  const program = new Command();
  program
    .name('garnerbin')
    .description('Receiving, grading, storage and settlement for a country elevator')
    .version(version, '-v, --version')
    .showHelpAfterError();

  registerValidate(program);
  registerGrade(program);
  registerSettle(program);
  registerRegister(program);
  registerPosition(program);
  registerBlend(program);
  registerCars(program);
  registerStorage(program);
  registerContracts(program);
  registerHedge(program);
  registerExceptions(program);
  registerBook(program);
  registerDoctor(program);
  registerAccounts(program);
  registerClose(program);
  registerBids(program);
  registerAudit(program);
  registerQueue(program);
  registerHaulers(program);
  registerSpace(program);
  registerSeason(program);
  registerBins(program);
  registerShip(program);
  registerBank(program);
  return program;
}

export async function run(argv, version) {
  const program = buildProgram(version);
  try {
    await program.parseAsync(argv);
    return process.exitCode ?? 0;
  } catch (error) {
    if (isGarnerbinError(error)) {
      console.error(error.toLine());
      return 2;
    }
    throw error;
  }
}
