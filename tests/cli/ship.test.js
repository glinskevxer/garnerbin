import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runShip } from '../../src/cli/ship.js';

const example = (name) => fileURLToPath(new URL(`../../examples/${name}`, import.meta.url));
const base = { file: example('orders-2026.json') };

let directory;

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'garnerbin-ship-'));
});

afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});

describe('checking a train', () => {
  const result = runShip(base);
  const [first] = result.results;

  it('builds a manifest for every shipment on the file', () => {
    expect(result.results).toHaveLength(1);
    expect(first.manifest.cars).toHaveLength(3);
  });

  it('composites the cars and grades them together', () => {
    expect(first.manifest.grade.grade).toBe(2);
    expect(first.manifest.releasable).toBe(true);
    expect(result.text).toContain('Meets the order. Release it.');
  });

  it('applies the cars to the order', () => {
    expect(first.status.shipped).toBe(1_140_500);
    expect(first.status.remaining).toBe(40_000_000 - 1_140_500);
  });

  it('plans how many cars the whole order would take', () => {
    expect(first.plan.cars).toBeGreaterThan(0);
    expect(result.text).toContain('limited by');
  });

  it('says how far short of a shuttle it is', () => {
    expect(first.train.qualifies).toBe(false);
    expect(result.text).toContain('cars short of 110');
  });

  it('narrows to one order', () => {
    expect(runShip({ ...base, order: 'SO-220' }).results).toHaveLength(1);
    expect(() => runShip({ ...base, order: 'SO-221' })).toThrow(/no shipment on that file/);
  });
});

describe('what it refuses', () => {
  it('refuses a file with no orders array', () => {
    expect(() => runShip({ file: example('rush-creek.json') })).toThrow(/carries no orders/);
  });
});

describe('writing the manifest out', () => {
  it('writes a csv with a row for each car', async () => {
    const out = join(directory, 'manifest.csv');
    runShip({ ...base, out });
    const csv = await readFile(out, 'utf8');
    expect(csv.split('\n')[0]).toBe('manifest,day,order,car,ticket,seal,bushels');
    expect(csv.trim().split('\n')).toHaveLength(4);
  });
});
