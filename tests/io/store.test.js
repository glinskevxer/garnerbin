import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { appendJournal, readJournal, readJson, updateJson, writeJson } from '../../src/io/store.js';

let directory;

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'garnerbin-'));
});

afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});

describe('reading and writing json', () => {
  it('writes a file and reads it back', async () => {
    const path = join(directory, 'position.json');
    await writeJson(path, { corn: 450_000 });
    expect(await readJson(path)).toEqual({ corn: 450_000 });
  });

  it('creates the directory on the way', async () => {
    const path = join(directory, 'deep', 'down', 'position.json');
    await writeJson(path, { ok: true });
    expect(await readJson(path)).toEqual({ ok: true });
  });

  it('leaves no temporary file behind', async () => {
    await writeJson(join(directory, 'a.json'), { a: 1 });
    const files = await readdir(directory);
    expect(files).toEqual(['a.json']);
  });

  it('returns the fallback when the file is not there', async () => {
    expect(await readJson(join(directory, 'missing.json'), { empty: true })).toEqual({
      empty: true,
    });
  });

  it('throws when the file is not there and there is no fallback', async () => {
    await expect(readJson(join(directory, 'missing.json'))).rejects.toThrow(/ENOENT/);
  });

  it('says which file is not json', async () => {
    const path = join(directory, 'broken.json');
    await writeFile(path, '{not json');
    await expect(readJson(path)).rejects.toThrow(/broken.json is not valid json/);
  });

  it('writes compactly when asked', async () => {
    const path = join(directory, 'tight.json');
    await writeJson(path, { a: 1, b: 2 }, { pretty: false });
    expect(await readJson(path)).toEqual({ a: 1, b: 2 });
  });
});

describe('updating', () => {
  it('reads, changes and writes back', async () => {
    const path = join(directory, 'counter.json');
    await writeJson(path, { loads: 1 });
    const next = await updateJson(path, (current) => ({ loads: current.loads + 1 }));
    expect(next).toEqual({ loads: 2 });
    expect(await readJson(path)).toEqual({ loads: 2 });
  });

  it('starts from the fallback on a file that is not there', async () => {
    const path = join(directory, 'new.json');
    await updateJson(path, (current) => ({ loads: current.loads + 1 }), { loads: 0 });
    expect(await readJson(path)).toEqual({ loads: 1 });
  });
});

describe('the journal', () => {
  it('appends a line at a time and reads them all back', async () => {
    const path = join(directory, 'audit.jsonl');
    await appendJournal(path, { event: 'receive', ticket: 'T-1' });
    await appendJournal(path, { event: 'ship', ticket: 'T-2' });
    const entries = await readJournal(path);
    expect(entries).toHaveLength(2);
    expect(entries[1].ticket).toBe('T-2');
  });

  it('reads a journal that is not there as empty', async () => {
    expect(await readJournal(join(directory, 'nothing.jsonl'))).toEqual([]);
  });

  it('says which line is broken', async () => {
    const path = join(directory, 'audit.jsonl');
    await appendJournal(path, { ok: true });
    await writeFile(path, '{"ok":true}\nnot json\n');
    await expect(readJournal(path)).rejects.toThrow(/line 2 of/);
  });
});
