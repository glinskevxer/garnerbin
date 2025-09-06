import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { runBlend } from '../../src/cli/blend.js';

const example = (name) => fileURLToPath(new URL(`../../examples/${name}`, import.meta.url));

const base = {
  samples: example('samples-2025-10-09.csv'),
  base: 'S-4474',
  baseBushels: '100000',
  add: 'S-4476',
  addBushels: '20000',
  target: '2',
};

describe('the blend calculator', () => {
  it('says how much will go in and what binds', () => {
    const result = runBlend(base);
    expect(result.plan.bushels).toBeGreaterThan(0);
    expect(result.text).toContain('Blending S-4476 into S-4474');
    expect(result.text).toContain('Will take');
    expect(result.text).toContain('Held by');
  });

  it('grades the blend it planned', () => {
    const result = runBlend(base);
    expect(result.plan.grade).toBeLessThanOrEqual(2);
    expect(result.text).toContain('Blend grades  US No. 2');
  });

  it('lays the three columns of readings out', () => {
    const result = runBlend(base);
    expect(result.text).toContain('Test weight');
    expect(result.text).toContain('Damaged kernels, total');
  });

  it('takes more of the bad lot at a looser target', () => {
    const tight = runBlend({ ...base, target: '2' });
    const loose = runBlend({ ...base, target: '3', addBushels: '200000' });
    expect(loose.plan.bushels).toBeGreaterThan(tight.plan.bushels);
  });

  it('says nothing will blend when the base is already past the limit', () => {
    const result = runBlend({ ...base, base: 'S-4476', add: 'S-4474', target: '2' });
    expect(result.plan).toBeNull();
    expect(result.text).toContain('Nothing will blend');
  });

  it('refuses a sample that is not in the file', () => {
    expect(() => runBlend({ ...base, base: 'S-9999' })).toThrow(/no sample S-9999/);
  });

  it('refuses a lot with no bushels behind it', () => {
    expect(() => runBlend({ ...base, addBushels: '0' })).toThrow(/give the bushels/);
  });

  it('refuses to blend two different grains', () => {
    expect(() => runBlend({ ...base, add: 'S-4475' })).toThrow(/not the same grain/);
  });
});
