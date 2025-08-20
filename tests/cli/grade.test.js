import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { runGrade } from '../../src/cli/grade.js';

const example = (name) => fileURLToPath(new URL(`../../examples/${name}`, import.meta.url));

const base = {
  samples: example('samples-2025-10-09.csv'),
  house: example('rush-creek.json'),
};

describe('grading a file', () => {
  it('prints a row for every sample', () => {
    const result = runGrade(base);
    expect(result.text).toContain('Rush Creek Grain grades');
    expect(result.text).toContain('S-4471');
    expect(result.text).toContain('S-4476');
    expect(result.graded).toHaveLength(7);
  });

  it('names what is holding each load back', () => {
    const result = runGrade(base);
    expect(result.text).toMatch(/S-4476.*damagedTotal/);
  });

  it('counts the distribution under the table', () => {
    const result = runGrade(base);
    expect(result.text).toMatch(/corn: US \d x\d/);
    expect(result.text).toContain('most often held by');
  });

  it('narrows to one commodity', () => {
    const result = runGrade({ ...base, commodity: 'soybeans' });
    expect(result.graded).toHaveLength(1);
    expect(result.text).toContain('S-4475');
    expect(result.text).not.toContain('S-4471');
  });

  it('works without a house file', () => {
    const result = runGrade({ samples: base.samples });
    expect(result.text).toContain('Samples grades');
  });
});

describe('one certificate', () => {
  it('prints the sheet for a single sample', () => {
    const result = runGrade({ ...base, id: 'S-4472' });
    expect(result.text).toContain('Inspection certificate S-4472');
    expect(result.text).toContain('House   Rush Creek Grain');
    expect(result.text).toContain('Grade   US No. 2');
  });

  it('says so when nothing matches', () => {
    expect(() => runGrade({ ...base, id: 'S-9999' })).toThrow(/no sample in that file matches/);
    expect(() => runGrade({ ...base, commodity: 'sorghum' })).toThrow(/no sample in that file/);
  });
});
