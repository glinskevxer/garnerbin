import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
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

/**
 * Modules the command line does not reach.
 *
 * These are library only on purpose: the package exports them and an office
 * script can call them, but no command does. The list is written down so a
 * module that quietly stops being reachable shows up here rather than rotting,
 * and so a new module has to be a deliberate addition to it.
 */
const LIBRARY_ONLY = [
  'contracts/minprice.js',
  'inventory/grainbank.js',
  'inventory/movements.js',
  'io/store.js',
  'loadout/truck.js',
  'settlement/advance.js',
  'storage/receipts.js',
];

function reachableFromCommands() {
  const edges = new Map();
  for (const file of sourceFiles) {
    const from = dirname(file);
    const out = [...read(file).matchAll(/from '(\.[^']+)'/g)].map((match) =>
      resolve(from, match[1])
    );
    edges.set(file, out);
  }
  const seen = new Set();
  const stack = sourceFiles.filter((file) => relative(file).startsWith('src/cli/'));
  while (stack.length > 0) {
    const file = stack.pop();
    if (seen.has(file)) continue;
    seen.add(file);
    for (const next of edges.get(file) ?? []) stack.push(next);
  }
  return seen;
}

describe('what the command line reaches', () => {
  const reached = reachableFromCommands();

  it('reaches everything except the modules written down as library only', () => {
    const unreached = sourceFiles
      .map((file) => relative(file).replace(/^src\//, ''))
      .filter((name) => name !== 'index.js')
      .filter((name) => !reached.has(join(root, 'src', name)));
    expect(unreached.sort()).toEqual([...LIBRARY_ONLY].sort());
  });

  it('exports every library only module from the index', () => {
    const index = read(join(root, 'src', 'index.js'));
    for (const name of LIBRARY_ONLY) {
      expect(index, name).toContain(`from './${name}'`);
    }
  });

  it('has a test for every library only module', () => {
    const tested = new Set(
      testFiles.map((file) =>
        relative(file)
          .replace(/^tests\//, '')
          .replace(/\.test\.js$/, '.js')
      )
    );
    for (const name of LIBRARY_ONLY) {
      expect(tested.has(name), name).toBe(true);
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
