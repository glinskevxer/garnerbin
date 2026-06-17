import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = fileURLToPath(new URL('../../', import.meta.url));
const manifest = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'));

/**
 * Run every npm script that drives a command.
 *
 * Nothing else in the suite runs the commands the way the scripts and the ci
 * job run them, and the gap is not theoretical: pulling the day option out of
 * one command into a shared block dropped its default and broke the settle
 * script while every unit test stayed green.
 */

const COMMAND_SCRIPTS = Object.entries(manifest.scripts).filter(([, script]) =>
  script.includes('bin/garnerbin.js')
);

/**
 * A command that found something to report exits one on purpose: space when
 * there is not enough room, exceptions when there is a stop. That is a finding
 * and not a failure, so the exit code is checked rather than thrown on. Two
 * means a coded error came out and nothing was printed, which is a failure.
 */
function run(args) {
  try {
    return {
      output: execFileSync(process.execPath, args, { cwd: root, encoding: 'utf8' }),
      code: 0,
    };
  } catch (error) {
    return { output: `${error.stdout ?? ''}${error.stderr ?? ''}`, code: error.status };
  }
}

describe('every command script', () => {
  it('covers every registered command', () => {
    expect(COMMAND_SCRIPTS.length).toBeGreaterThan(10);
  });

  for (const [name, script] of COMMAND_SCRIPTS) {
    it(`runs ${name}`, () => {
      const invocations = script.split(' && ');
      let output = '';
      for (const invocation of invocations) {
        const parts = invocation.trim().split(/\s+/);
        expect(parts[0]).toBe('node');
        expect(parts[1]).toBe('bin/garnerbin.js');
        const result = run(parts.slice(1));
        expect(result.code, `${name} exited ${result.code}`).toBeLessThan(2);
        output += result.output;
      }
      expect(output.length).toBeGreaterThan(20);
      expect(output).not.toContain('undefined');
      expect(output).not.toMatch(/\bNaN\b/);
    });
  }
});

/**
 * A command that finds something exits one on purpose. The workflow has to
 * tolerate that, and until this test existed it only passed because the worked
 * day happened not to trigger a finding for any command that ci ran bare.
 *
 * Adding the bank command broke that by accident: its example carries an
 * overdrawn account on purpose, so the command correctly exited one and the ci
 * job went red on a green repo. The invariant is checked here rather than left
 * to the shape of the example data.
 */
describe('the workflow and the exit codes agree', () => {
  const workflow = readFileSync(join(root, '.github', 'workflows', 'ci.yml'), 'utf8');

  const signalling = readdirSync(join(root, 'src', 'cli'))
    .filter((file) => file.endsWith('.js'))
    .filter((file) =>
      readFileSync(join(root, 'src', 'cli', file), 'utf8').includes('process.exitCode = 1')
    )
    .map((file) => file.replace(/\.js$/, ''));

  it('finds the commands that can report a finding', () => {
    expect(signalling).toContain('bank');
    expect(signalling).toContain('bins');
    expect(signalling).toContain('space');
  });

  for (const [name, script] of COMMAND_SCRIPTS) {
    const line = workflow.split('\n').find((row) => row.trim() === `run: npm run ${name}`);
    // `|| true` would swallow a crash as readily as a finding. The form the
    // workflow uses tolerates exit 1 and nothing else, so a coded error or a
    // segfault still turns the job red.
    const tolerated = workflow.includes(`npm run ${name} || test $? -eq 1`);

    it(`runs ${name} in ci in a way that matches its exit code`, () => {
      // A script can be a chain. It exits non zero if any link does, so walk
      // them all rather than splitting the whole string on whitespace, which
      // would hand the && and the second node straight to the first command.
      let code = 0;
      for (const invocation of script.split(' && ')) {
        const parts = invocation.trim().split(/\s+/);
        if (parts[0] !== 'node') continue;
        const result = run(parts.slice(1));
        if (result.code !== 0) {
          code = result.code;
          break;
        }
      }
      if (code === 0) return;
      expect(
        tolerated,
        `${name} exits ${code} on the worked day, so ci must run it as ` +
          `"npm run ${name} || test $? -eq 1"`
      ).toBe(true);
      expect(line, `${name} is run bare in ci`).toBeUndefined();
    });
  }
});

describe('ci tolerates a finding without tolerating a crash', () => {
  const workflow = readFileSync(join(root, '.github', 'workflows', 'ci.yml'), 'utf8');

  it('never uses the bare || true form, which hides a crash', () => {
    expect(workflow).not.toContain('|| true');
  });

  it('tolerates exactly exit one where it tolerates anything', () => {
    const tolerant = workflow
      .split('\n')
      .filter((line) => line.includes('npm run') && line.includes('||'));
    expect(tolerant.length).toBeGreaterThan(0);
    for (const line of tolerant) {
      expect(line, line.trim()).toMatch(/\|\| test \$\? -eq 1$/);
    }
  });

  it('covers every command that can report a finding', () => {
    const tolerated = signallingCommands().filter((name) =>
      workflow.includes(`npm run ${name} || test $? -eq 1`)
    );
    expect(tolerated).toEqual(expect.arrayContaining(['bank', 'bins', 'space']));
  });
});

export function signallingCommands() {
  return readdirSync(join(root, 'src', 'cli'))
    .filter((file) => file.endsWith('.js'))
    .filter((file) =>
      readFileSync(join(root, 'src', 'cli', file), 'utf8').includes('process.exitCode = 1')
    )
    .map((file) => file.replace(/\.js$/, ''));
}
