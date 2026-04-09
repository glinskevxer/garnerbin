import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

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
