import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (name) => readFileSync(new URL(`../${name}`, import.meta.url), 'utf8');
const manifest = JSON.parse(read('package.json'));
const dockerfile = read('Dockerfile');
const ignored = read('.dockerignore');

/**
 * The mistake this catches is the one that actually happens: a file the runtime
 * needs left out of the image, or a dependency that only exists in devDeps but
 * gets imported from src. Building the image in CI catches it too, but only
 * after five minutes, and only where docker is available.
 */

describe('the manifest', () => {
  it('ships the directories the binary needs', () => {
    expect(manifest.files).toEqual(['bin/', 'src/', 'examples/', 'README.md']);
  });

  it('pins every dependency to an exact version', () => {
    const all = { ...manifest.dependencies, ...manifest.devDependencies };
    for (const [name, version] of Object.entries(all)) {
      expect(version, name).toMatch(/^\d+\.\d+\.\d+$/);
    }
  });

  it('keeps the runtime dependencies down to what is really used', () => {
    expect(Object.keys(manifest.dependencies)).toEqual(['commander']);
  });

  it('names the binary and the entry point', () => {
    expect(manifest.bin.garnerbin).toBe('./bin/garnerbin.js');
    expect(manifest.main).toBe('./src/index.js');
    expect(manifest.type).toBe('module');
  });

  it('asks for a node the code actually needs', () => {
    expect(manifest.engines.node).toBe('>=20.11');
  });
});

describe('the image', () => {
  it('copies in every directory the manifest ships', () => {
    for (const directory of ['bin', 'src', 'examples']) {
      expect(dockerfile).toContain(`COPY ${directory} ./${directory}`);
    }
  });

  it('installs without the dev dependencies', () => {
    expect(dockerfile).toContain('npm ci --omit=dev');
  });

  it('runs as a user that is not root', () => {
    expect(dockerfile).toContain('USER node');
  });

  it('builds on the node version the ci matrix starts from', () => {
    expect(dockerfile).toMatch(/FROM node:20\.\d+\.\d+-bookworm-slim/);
  });

  it('leaves the tests out of the image', () => {
    expect(ignored).toContain('tests');
    expect(ignored).toContain('node_modules');
  });
});

describe('nothing in src reaches for a dev dependency', () => {
  it('imports only node builtins, commander and relative paths', async () => {
    const { readdirSync, statSync } = await import('node:fs');
    const { join } = await import('node:path');
    const root = new URL('../src/', import.meta.url).pathname;
    const files = [];
    const walk = (directory) => {
      for (const entry of readdirSync(directory)) {
        const path = join(directory, entry);
        if (statSync(path).isDirectory()) walk(path);
        else if (entry.endsWith('.js')) files.push(path);
      }
    };
    walk(root);
    const allowed = new Set(['commander']);
    for (const file of files) {
      const source = readFileSync(file, 'utf8');
      for (const match of source.matchAll(/from '([^']+)'/g)) {
        const specifier = match[1];
        if (specifier.startsWith('.') || specifier.startsWith('node:')) continue;
        expect(allowed.has(specifier), `${file} imports ${specifier}`).toBe(true);
      }
    }
  });
});
