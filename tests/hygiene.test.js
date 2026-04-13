import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = fileURLToPath(new URL('../', import.meta.url));

function walk(directory, found = []) {
  for (const entry of readdirSync(directory).sort()) {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) walk(path, found);
    else if (entry.endsWith('.js')) found.push(path);
  }
  return found;
}

const sourceFiles = walk(join(root, 'src'));
const testFiles = walk(join(root, 'tests'));
const relative = (path) => path.slice(root.length);
const read = (path) => readFileSync(path, 'utf8');

/**
 * House rules, checked rather than remembered.
 *
 * None of these are style for its own sake. Printing from a module the command
 * line calls makes it untestable, a module with no note at the top costs the
 * next person twenty minutes, and a file that has grown past six hundred lines
 * has stopped being one thing.
 */

describe('the source', () => {
  it('prints only from the command line and the binary', () => {
    for (const file of sourceFiles) {
      if (relative(file).startsWith('src/cli/')) continue;
      expect(read(file), relative(file)).not.toMatch(/\bconsole\.(log|error|warn)\(/);
    }
  });

  it('opens every module with a note saying what it is for', () => {
    for (const file of sourceFiles) {
      if (relative(file) === 'src/index.js') continue;
      const head = read(file).slice(0, 2000);
      expect(head, relative(file)).toMatch(/\/\*\*[\s\S]*?\*\//);
    }
  });

  it('keeps every file under six hundred lines', () => {
    for (const file of [...sourceFiles, ...testFiles]) {
      const lines = read(file).split('\n').length;
      expect(lines, `${relative(file)} is ${lines} lines`).toBeLessThan(600);
    }
  });

  it('leaves no notes to self behind', () => {
    const marker = ['TO', 'DO'].join('');
    const pattern = new RegExp(`\\b(${marker}|FIX${'ME'}|X${'XX'}|HA${'CK'})\\b`);
    for (const file of [...sourceFiles, ...testFiles]) {
      if (relative(file) === 'tests/hygiene.test.js') continue;
      expect(read(file), relative(file)).not.toMatch(pattern);
    }
  });

  it('imports nothing from a test', () => {
    for (const file of sourceFiles) {
      expect(read(file), relative(file)).not.toContain("from '../../tests/");
    }
  });

  it('reads the filesystem only where a command or the store does', () => {
    const allowed = ['src/io/store.js', 'src/cli/'];
    for (const file of sourceFiles) {
      if (allowed.some((prefix) => relative(file).startsWith(prefix))) continue;
      expect(read(file), relative(file)).not.toMatch(/from 'node:fs/);
    }
  });

  it('reads the clock nowhere at all', () => {
    for (const file of sourceFiles) {
      expect(read(file), relative(file)).not.toMatch(/Date\.now\(\)|new Date\(\)/);
    }
  });
});

describe('the tests', () => {
  it('has a test file for every module that is not the index', () => {
    const tested = new Set(
      testFiles.map((file) =>
        relative(file)
          .replace(/^tests\//, '')
          .replace(/\.test\.js$/, '.js')
      )
    );
    const missing = sourceFiles
      .map((file) => relative(file).replace(/^src\//, ''))
      .filter((name) => name !== 'index.js' && !tested.has(name));
    expect(missing).toEqual([]);
  });

  it('never skips a test', () => {
    for (const file of testFiles) {
      expect(read(file), relative(file)).not.toMatch(/\b(it|describe)\.(skip|todo|only)\b/);
    }
  });

  it('asserts something in every test file', () => {
    for (const file of testFiles) {
      expect(read(file), relative(file)).toContain('expect(');
    }
  });
});
