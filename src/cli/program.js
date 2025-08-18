import { Command } from 'commander';
import { isGarnerbinError } from '../core/errors.js';
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
