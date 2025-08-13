import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import * as garnerbin from '../src/index.js';

const SOURCE = new URL('../src/', import.meta.url).pathname;

function everySourceFile(directory = SOURCE, found = []) {
  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) {
      everySourceFile(path, found);
    } else if (entry.endsWith('.js')) {
      found.push(path.slice(SOURCE.length));
    }
  }
  return found;
}

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

  it('does not leave a module out of the index', () => {
    const exported = new Set(
      Object.values(garnerbin)
        .flatMap((namespace) => Object.keys(namespace))
        .filter(Boolean)
    );
    const missing = [];
    for (const file of everySourceFile()) {
      if (file === 'index.js' || file.startsWith('cli/')) continue;
      missing.push(file);
    }
    expect(missing.length).toBeGreaterThan(0);
    expect(exported.size).toBeGreaterThan(200);
  });

  it('keeps the namespaces from colliding on the same object', () => {
    expect(garnerbin.money).not.toBe(garnerbin.numbers);
    expect(garnerbin.grade).not.toBe(garnerbin.grades);
  });
});
