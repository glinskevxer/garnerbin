import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { buildProgram } from '../src/cli/program.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const read = (name) => readFileSync(join(root, name), 'utf8');
const readme = read('README.md');
const architecture = read('ARCHITECTURE.md');
const changelog = read('CHANGELOG.md');
const manifest = JSON.parse(read('package.json'));

/**
 * Documentation goes stale silently. These check the two ways it goes stale
 * here: a command nobody wrote down, and a directory of source nobody
 * mentioned.
 */

describe('the readme', () => {
  it('names every command the program registers', () => {
    for (const command of buildProgram('0.0.0').commands) {
      expect(readme, command.name()).toContain(`npm run ${command.name()}`);
    }
  });

  it('states the rules that are easy to get wrong', () => {
    expect(readme).toContain('Dockage comes off before shrink');
    expect(readme).toContain('legal weight, not the test weight');
    expect(readme).toContain('Money is never a float');
  });

  it('lists every source directory in its layout table', () => {
    for (const entry of readdirSync(join(root, 'src'))) {
      if (!statSync(join(root, 'src', entry)).isDirectory()) continue;
      expect(readme, entry).toContain(`\`src/${entry}\``);
    }
  });
});

describe('the architecture note', () => {
  it('describes every source directory', () => {
    for (const entry of readdirSync(join(root, 'src'))) {
      if (!statSync(join(root, 'src', entry)).isDirectory()) continue;
      expect(architecture, entry).toContain(`src/${entry}`);
    }
  });

  it('writes the rules down where they can be checked', () => {
    expect(architecture).toContain('Nothing is edited in place');
    expect(architecture).toContain('Errors carry codes');
  });
});

describe('the changelog', () => {
  it('has an unreleased section', () => {
    expect(changelog).toContain('## Unreleased');
  });

  it('is not empty', () => {
    expect(changelog.split('\n').filter((line) => line.startsWith('- ')).length).toBeGreaterThan(5);
  });
});

describe('the worked example', () => {
  it('is pointed at from the readme', () => {
    expect(readme).toContain('`examples/`');
  });

  it('has a file behind every npm script that names one', () => {
    const files = new Set(readdirSync(join(root, 'examples')));
    for (const script of Object.values(manifest.scripts)) {
      for (const match of script.matchAll(/examples\/([\w.-]+)/g)) {
        expect(files, match[1]).toContain(match[1]);
      }
    }
  });
});

describe('the manifest', () => {
  it('ships the readme with the package', () => {
    expect(manifest.files).toContain('README.md');
  });

  it('has a description somebody could read', () => {
    expect(manifest.description.length).toBeGreaterThan(20);
  });
});
