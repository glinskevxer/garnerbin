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

describe('the milling readings', () => {
  const wheat = {
    samples: example('samples-wheat-2026-01.csv'),
    house: example('rush-creek.json'),
  };

  it('prints them under the certificate for a wheat sample', () => {
    const result = runGrade({ ...wheat, id: 'S-6101' });
    expect(result.text).toContain('Protein on the twelve basis');
    expect(result.text).toContain('Falling number');
    expect(result.text).toContain('Millable');
  });

  it('puts protein onto the twelve basis', () => {
    expect(runGrade({ ...wheat, id: 'S-6101' }).text).toMatch(
      /Protein on the twelve basis +12\.37/
    );
  });

  it('turns a sprouted load down for milling', () => {
    const result = runGrade({ ...wheat, id: 'S-6103' });
    expect(result.text).toContain('sprouted');
    expect(result.text).toMatch(/Millable +no/);
  });

  it('prints nothing extra for corn', () => {
    const result = runGrade({ ...base, id: 'S-4471' });
    expect(result.text).not.toContain('Falling number');
  });

  it('grades a whole wheat file without the milling block', () => {
    const result = runGrade(wheat);
    expect(result.graded).toHaveLength(4);
    expect(result.text).not.toContain('Millable');
  });

  it('lists the markets a clean load can still go to', () => {
    expect(runGrade({ ...wheat, id: 'S-6104' }).text).toMatch(/Markets open +human, swine/);
  });

  it('reads a load with no falling number as millable', () => {
    const noSprout = runGrade({ ...wheat, id: 'S-6104' });
    expect(noSprout.text).toMatch(/Millable +yes/);
  });

  it('reports protein both ways round', () => {
    const text = runGrade({ ...wheat, id: 'S-6102' }).text;
    expect(text).toContain('Protein as received');
    expect(text).toMatch(/Falling number +318 \(sound\)/);
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
