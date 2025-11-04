import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import * as garnerbin from '../src/index.js';

const SOURCE = fileURLToPath(new URL('../src/', import.meta.url));
const indexSource = readFileSync(join(SOURCE, 'index.js'), 'utf8');

function everySourceFile(directory = SOURCE, prefix = '', found = []) {
  for (const entry of readdirSync(directory).sort()) {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) {
      everySourceFile(path, `${prefix}${entry}/`, found);
    } else if (entry.endsWith('.js')) {
      found.push(`${prefix}${entry}`);
    }
  }
  return found;
}

/**
 * The check that earns its keep is the last one: a module added under src and
 * never added to the index is invisible to anything importing the package, and
 * nothing else in the suite would notice.
 */

describe('the public surface', () => {
  it('exports a namespace for every part of the house', () => {
    for (const name of ['money', 'grade', 'settle', 'position', 'house', 'journal']) {
      expect(garnerbin[name]).toBeTypeOf('object');
    }
  });

  it('carries the things the command line calls', () => {
    expect(garnerbin.settle.settleLoad).toBeTypeOf('function');
    expect(garnerbin.house.loadHouse).toBeTypeOf('function');
    expect(garnerbin.certificate.certificateFor).toBeTypeOf('function');
    expect(garnerbin.rail.planCars).toBeTypeOf('function');
  });

  it('exports every module under src that is not the index or a command', () => {
    const missing = everySourceFile().filter((file) => {
      if (file === 'index.js' || file.startsWith('cli/')) return false;
      return !indexSource.includes(`from './${file}'`);
    });
    expect(missing).toEqual([]);
  });

  it('names every namespace after something', () => {
    for (const [name, namespace] of Object.entries(garnerbin)) {
      expect(name, `${name} exports nothing`).toBeTruthy();
      expect(Object.keys(namespace).length, `${name} exports nothing`).toBeGreaterThan(0);
    }
  });

  it('keeps the namespaces from colliding on the same object', () => {
    expect(garnerbin.money).not.toBe(garnerbin.numbers);
    expect(garnerbin.grade).not.toBe(garnerbin.grades);
    expect(garnerbin.basis).not.toBe(garnerbin.basisbook);
  });

  it('exports each module under exactly one name', () => {
    const seen = new Map();
    for (const [name, namespace] of Object.entries(garnerbin)) {
      const already = seen.get(namespace);
      expect(already, `${name} is the same module as ${already}`).toBeUndefined();
      seen.set(namespace, name);
    }
  });

  it('exports enough to be worth having an index', () => {
    const total = Object.values(garnerbin).reduce(
      (sum, namespace) => sum + Object.keys(namespace).length,
      0
    );
    expect(total).toBeGreaterThan(400);
  });
});
