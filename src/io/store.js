import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { FormatError } from '../core/errors.js';
import { isString } from '../core/assert.js';

/**
 * The little JSON store the office runs on.
 *
 * Everything is written to a temporary name in the same directory and then
 * renamed over the target, because rename inside one filesystem is atomic and
 * writing in place is not. The failure this prevents is the one that matters:
 * the power going off halfway through saving the position file and the house
 * starting the next morning with a truncated inventory.
 */

let counter = 0;

function temporaryName(path) {
  counter += 1;
  return `${path}.tmp-${process.pid}-${counter}`;
}

export async function ensureParent(path) {
  await mkdir(dirname(isString(path, 'path')), { recursive: true });
}

export async function readJson(path, fallback) {
  isString(path, 'path');
  let text;
  try {
    text = await readFile(path, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT' && fallback !== undefined) return fallback;
    throw error;
  }
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new FormatError('BAD_JSON', `${path} is not valid json: ${error.message}`, { path });
  }
}

export async function writeJson(path, value, { pretty = true } = {}) {
  isString(path, 'path');
  await ensureParent(path);
  const temporary = temporaryName(path);
  const text = pretty ? `${JSON.stringify(value, null, 2)}\n` : `${JSON.stringify(value)}\n`;
  try {
    await writeFile(temporary, text, 'utf8');
    await rename(temporary, path);
  } catch (error) {
    await unlink(temporary).catch(() => {});
    throw error;
  }
  return path;
}

/** Read, change, write back. The read and the write are not atomic together. */
export async function updateJson(path, change, fallback) {
  const current = await readJson(path, fallback);
  const next = await change(current);
  await writeJson(path, next);
  return next;
}

/** The audit journal is one json object a line, appended and never rewritten. */
export async function appendJournal(path, entry) {
  isString(path, 'path');
  await ensureParent(path);
  await writeFile(path, `${JSON.stringify(entry)}\n`, { encoding: 'utf8', flag: 'a' });
  return path;
}

export async function readJournal(path) {
  let text;
  try {
    text = await readFile(path, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
  return text
    .split('\n')
    .filter((line) => line.trim() !== '')
    .map((line, index) => {
      try {
        return JSON.parse(line);
      } catch {
        throw new FormatError('BAD_JOURNAL_LINE', `line ${index + 1} of ${path} is not json`, {
          path,
          line: index + 1,
        });
      }
    });
}
