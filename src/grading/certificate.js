import { isPlainObject, isString } from '../core/assert.js';
import { heading, keyValue, pad, renderTable } from '../core/text.js';
import { getCommodity } from '../commodity/registry.js';
import { formatFactor, getFactor } from './factors.js';
import { factorsFor, limitOf, SAMPLE_GRADE } from './standards.js';
import { gradeSample } from './special.js';

/**
 * The inspection certificate.
 *
 * This is the piece of paper that travels with the load and the one the buyer
 * argues from, so it prints the reading and the limit side by side. A grader
 * who has to explain a grade over the phone should be able to read the answer
 * straight off the sheet.
 *
 * It grades the sample once. The first version of this graded it twice, once on
 * the readings alone and once with the condition flags folded in, and used the
 * first answer for one field and the second for the rest. gradeSample already
 * takes the whole sample and separates the numeric grade from the conditions
 * that override it, so there was never anything for the second call to add.
 */

export function buildCertificate(sample, { number, house, inspector, issuedOn } = {}) {
  isPlainObject(sample, 'sample');
  const graded = gradeSample(sample.commodity, sample);
  const binding = new Set(graded.limitingFactors.map((entry) => entry.factor));
  const rows = factorsFor(sample.commodity).map((factorId) => ({
    factor: getFactor(factorId).label,
    reading: formatFactor(factorId, sample[factorId]),
    limit:
      graded.grade === SAMPLE_GRADE
        ? 'n/a'
        : formatFactor(factorId, limitOf(sample.commodity, graded.grade, factorId)),
    binding: binding.has(factorId) ? 'yes' : '',
  }));
  return {
    number: number ?? sample.id,
    house: house ?? 'unnamed house',
    inspector: inspector ?? sample.grader ?? 'unsigned',
    issuedOn: issuedOn ?? sample.day,
    commodity: getCommodity(sample.commodity),
    sampleId: sample.id,
    grams: sample.grams,
    grade: graded.grade,
    label: graded.label,
    specialGrades: graded.specialGrades,
    sampleGradeReasons: graded.sampleGradeReasons,
    numericGrade: graded.numericGrade,
    rows,
    moisture: typeof sample.moisture === 'number' ? sample.moisture : null,
    dockage: typeof sample.dockage === 'number' ? sample.dockage : null,
  };
}

export function renderCertificate(certificate) {
  isPlainObject(certificate, 'certificate');
  const parts = [
    heading(`Inspection certificate ${certificate.number}`),
    keyValue([
      ['House', certificate.house],
      ['Sample', certificate.sampleId],
      ['Issued', certificate.issuedOn],
      ['Grain', certificate.commodity.name],
      ['Grade', certificate.label],
    ]),
    '',
    renderTable(
      [
        { header: 'factor', key: 'factor' },
        { header: 'reading', key: 'reading', align: 'right' },
        { header: 'limit', key: 'limit', align: 'right' },
        { header: 'binding', key: 'binding' },
      ],
      certificate.rows
    ),
  ];
  const notes = [];
  if (certificate.moisture !== null) notes.push(`Moisture ${certificate.moisture.toFixed(1)} %`);
  if (certificate.dockage !== null) notes.push(`Dockage ${certificate.dockage.toFixed(1)} %`);
  if (notes.length > 0) parts.push('', notes.join('    '));
  if (certificate.sampleGradeReasons.length > 0) {
    parts.push('', `Sample grade because of ${certificate.sampleGradeReasons.join(', ')}.`);
  }
  parts.push('', `${pad('Inspected by', 16)}${certificate.inspector}`);
  return parts.join('\n');
}

export function certificateFor(sample, options = {}) {
  return renderCertificate(buildCertificate(sample, options));
}

/** A one line form for the ticket register. */
export function certificateLine(certificate) {
  isString(certificate.number, 'number');
  return `${certificate.number}  ${certificate.commodity.id}  ${certificate.label}`;
}
