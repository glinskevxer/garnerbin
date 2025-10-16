import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (name) => readFileSync(new URL(`../${name}`, import.meta.url), 'utf8');
const workflow = read('.github/workflows/ci.yml');
const manifest = JSON.parse(read('package.json'));

/**
 * Reading the workflow as text is cruder than parsing it and it catches the
 * thing that goes wrong: a command added to the readme and the package and
 * never added to the job that proves it still runs.
 */

describe('the workflow', () => {
  it('runs on pushes and pull requests to main', () => {
    expect(workflow).toContain('branches: [main]');
    expect(workflow).toContain('cancel-in-progress: true');
  });

  it('has the six jobs', () => {
    for (const job of ['lint:', 'test:', 'coverage:', 'audit:', 'worked-day:', 'image:']) {
      expect(workflow).toContain(`  ${job}`);
    }
  });

  it('tests on three node versions', () => {
    expect(workflow).toContain("node: ['20.18.2', '22.13.1', '24.20.0']");
  });

  it('runs every npm script that drives a command', () => {
    for (const script of Object.keys(manifest.scripts)) {
      if (['test', 'test:watch', 'format', 'coverage', 'lint', 'format:check'].includes(script)) {
        continue;
      }
      expect(workflow, script).toContain(`npm run ${script}`);
    }
  });

  it('checks the journal seals the same way twice', () => {
    expect(workflow).toContain('the journal seals the same way twice');
    expect(workflow).toContain('diff /tmp/seal-a.txt /tmp/seal-b.txt');
  });

  it('checks the files the commands wrote rather than only that they ran', () => {
    expect(workflow).toContain('test -s /tmp/settlements.csv');
    expect(workflow).toContain('test -s /tmp/journal.json');
  });

  it('runs the same command twice and diffs it', () => {
    expect(workflow).toContain('diff /tmp/first.txt /tmp/second.txt');
  });

  it('audits only the runtime dependencies', () => {
    expect(workflow).toContain('npm audit --omit=dev --audit-level=moderate');
  });

  it('builds the image and runs something inside it', () => {
    expect(workflow).toContain('docker build -t garnerbin:ci .');
    expect(workflow).toContain('docker run --rm');
  });

  it('pins the node the lint job uses to the one in the dockerfile', () => {
    const [, dockerNode] = /FROM node:(\d+\.\d+\.\d+)-bookworm-slim/.exec(read('Dockerfile'));
    expect(workflow).toContain(`node-version: ${dockerNode}`);
  });
});
