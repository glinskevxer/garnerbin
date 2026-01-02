import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { buildProgram } from '../../src/cli/program.js';

const binary = fileURLToPath(new URL('../../bin/garnerbin.js', import.meta.url));
const root = fileURLToPath(new URL('../../', import.meta.url));
const manifest = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'));

function garnerbin(args, { expectFailure = false } = {}) {
  try {
    return execFileSync(process.execPath, [binary, ...args], { cwd: root, encoding: 'utf8' });
  } catch (error) {
    if (expectFailure) return `${error.stdout ?? ''}${error.stderr ?? ''}`;
    throw error;
  }
}

describe('the program', () => {
  const program = buildProgram(manifest.version);

  it('registers every command the readme names', () => {
    const names = program.commands.map((command) => command.name()).sort();
    expect(names).toEqual([
      'accounts',
      'blend',
      'book',
      'cars',
      'close',
      'contracts',
      'doctor',
      'exceptions',
      'grade',
      'hedge',
      'position',
      'register',
      'settle',
      'storage',
      'validate',
    ]);
  });

  it('gives every command a description', () => {
    for (const command of program.commands) {
      expect(command.description().length).toBeGreaterThan(10);
    }
  });

  it('has an npm script for every command', () => {
    for (const command of program.commands) {
      expect(Object.keys(manifest.scripts)).toContain(command.name());
    }
  });
});

describe('running the binary', () => {
  it('prints the version from the package', () => {
    expect(garnerbin(['--version']).trim()).toBe(manifest.version);
  });

  it('prints help with the commands in it', () => {
    const help = garnerbin(['--help']);
    expect(help).toContain('garnerbin');
    expect(help).toContain('settle');
    expect(help).toContain('doctor');
  });

  it('runs the worked day end to end', () => {
    const output = garnerbin([
      'settle',
      '-c',
      'examples/rush-creek.json',
      '-t',
      'examples/tickets-2025-10-09.csv',
      '-s',
      'examples/samples-2025-10-09.csv',
      '-b',
      '4.2750',
    ]);
    expect(output).toContain('Rush Creek Grain settlements');
    expect(output).toContain('Paid out');
  });

  it('gives the same answer twice', () => {
    const args = ['grade', '-s', 'examples/samples-2025-10-09.csv'];
    expect(garnerbin(args)).toBe(garnerbin(args));
  });

  it('reports a coded error rather than a stack trace', () => {
    const output = garnerbin(['validate', '-c', 'examples/nowhere.json'], { expectFailure: true });
    expect(output).toContain('FILE_NOT_FOUND');
    expect(output).not.toContain('at Object.');
  });
});
