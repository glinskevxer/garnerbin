import { describe, expect, it } from 'vitest';
import { createSample } from '../../src/grading/sample.js';
import {
  buildCertificate,
  certificateFor,
  certificateLine,
  renderCertificate,
} from '../../src/grading/certificate.js';

const sample = createSample({
  id: 'S-4471',
  commodity: 'corn',
  day: '2025-10-09',
  grader: 'D Ohara',
  testWeight: 54.6,
  damagedTotal: 4.2,
  heatDamaged: 0.1,
  bcfm: 2.6,
  moisture: 16.8,
});

describe('buildCertificate', () => {
  it('grades the sample and carries the header fields', () => {
    const certificate = buildCertificate(sample, { number: 'C-9001', house: 'Rush Creek' });
    expect(certificate.number).toBe('C-9001');
    expect(certificate.house).toBe('Rush Creek');
    expect(certificate.grade).toBe(2);
    expect(certificate.label).toBe('US No. 2');
    expect(certificate.inspector).toBe('D Ohara');
    expect(certificate.issuedOn).toBe('2025-10-09');
  });

  it('falls back to the sample id and the sample day', () => {
    const certificate = buildCertificate(sample);
    expect(certificate.number).toBe('S-4471');
    expect(certificate.house).toBe('unnamed house');
  });

  it('prints a row for every factor in the table with its limit', () => {
    const certificate = buildCertificate(sample);
    expect(certificate.rows).toHaveLength(4);
    const damaged = certificate.rows.find((row) => row.factor.startsWith('Damaged'));
    expect(damaged.reading).toBe('4.2 %');
    expect(damaged.limit).toBe('5.0 %');
    expect(damaged.binding).toBe('yes');
  });

  it('marks nothing binding on a factor with room to spare', () => {
    const certificate = buildCertificate(sample);
    const heat = certificate.rows.find((row) => row.factor.startsWith('Heat'));
    expect(heat.binding).toBe('');
  });

  it('shows no limits at all on a sample grade load', () => {
    const musty = createSample({ ...sampleFields(), musty: true });
    const certificate = buildCertificate(musty);
    expect(certificate.grade).toBe('sample');
    expect(certificate.rows.every((row) => row.limit === 'n/a')).toBe(true);
    expect(certificate.sampleGradeReasons).toEqual(['a musty odor']);
  });

  it('carries the special grades into the label', () => {
    const buggy = createSample({ ...sampleFields(), liveWeevils: 3 });
    expect(buildCertificate(buggy).label).toBe('US No. 2, infested');
  });

  it('keeps the numeric grade beside the grade that overrode it', () => {
    const musty = createSample({ ...sampleFields(), musty: true });
    const certificate = buildCertificate(musty);
    expect(certificate.grade).toBe('sample');
    expect(certificate.numericGrade).toBe(2);
  });

  it('marks every binding factor and no others', () => {
    const certificate = buildCertificate(sample);
    const marked = certificate.rows.filter((row) => row.binding === 'yes').map((row) => row.factor);
    expect(marked).toEqual([
      'Test weight',
      'Damaged kernels, total',
      'Broken corn and foreign material',
    ]);
  });

  it('marks one factor when only one is at the grade', () => {
    const clean = createSample({ ...sampleFields(), testWeight: 57, bcfm: 1, damagedTotal: 4.2 });
    const marked = buildCertificate(clean)
      .rows.filter((row) => row.binding === 'yes')
      .map((row) => row.factor);
    expect(marked).toEqual(['Damaged kernels, total']);
  });

  it('marks nothing binding when everything is comfortably inside', () => {
    const clean = createSample({
      ...sampleFields(),
      testWeight: 58,
      damagedTotal: 0.5,
      heatDamaged: 0,
      bcfm: 0.5,
    });
    const certificate = buildCertificate(clean);
    expect(certificate.grade).toBe(1);
    expect(certificate.rows.some((row) => row.binding === 'yes')).toBe(true);
  });

  it('carries the sample weight through', () => {
    expect(buildCertificate(sample).grams).toBe(1000);
  });
});

function sampleFields() {
  return {
    id: 'S-4471',
    commodity: 'corn',
    day: '2025-10-09',
    testWeight: 54.6,
    damagedTotal: 4.2,
    heatDamaged: 0.1,
    bcfm: 2.6,
    moisture: 16.8,
  };
}

describe('renderCertificate', () => {
  it('prints a sheet the grader can read down the phone', () => {
    const text = certificateFor(sample, { number: 'C-9001', house: 'Rush Creek' });
    expect(text).toContain('Inspection certificate C-9001');
    expect(text).toContain('Grade   US No. 2');
    expect(text).toContain('Moisture 16.8 %');
    expect(text).toContain('Inspected by    D Ohara');
  });

  it('names the reason when the load is sample grade', () => {
    const heating = createSample({ ...sampleFields(), heating: true });
    expect(certificateFor(heating)).toContain('Sample grade because of the grain is heating.');
  });

  it('leaves the moisture line off when nobody took one', () => {
    const { moisture: _moisture, ...dry } = sampleFields();
    const text = renderCertificate(buildCertificate(createSample(dry)));
    expect(text).not.toContain('Moisture');
  });

  it('gives a one line form for the register', () => {
    const certificate = buildCertificate(sample, { number: 'C-9001' });
    expect(certificateLine(certificate)).toBe('C-9001  corn  US No. 2');
  });
});
