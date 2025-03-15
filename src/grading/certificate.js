import { isPlainObject, isString } from '../core/assert.js';
import { heading, keyValue, pad, renderTable } from '../core/text.js';
import { getCommodity } from '../commodity/registry.js';
import { formatFactor, getFactor } from './factors.js';
import { factorsFor, limitOf, SAMPLE_GRADE } from './standards.js';
import { gradeSample } from './special.js';
import { readingsOf } from './sample.js';

/**
 * The inspection certificate.
 *
 * This is the piece of paper that travels with the load and the one the buyer
 * argues from, so it prints the reading and the limit side by side. A grader
 * who has to explain a grade over the phone should be able to read the answer
 * straight off the sheet.
 */

export function buildCertificate(sample, { number, house, inspector, issuedOn } = {}) {
  isPlainObject(sample, 'sample');
  const graded = gradeSample(sample.commodity, readingsOf(sample), sample);
  const full = gradeSample(sample.commodity, { ...readingsOf(sample), ...conditionsOf(sample) });
  const rows = factorsFor(sample.commodity).map((factorId) => ({
    factor: getFactor(factorId).label,
    reading: formatFactor(factorId, sample[factorId]),
    limit:
      full.grade === SAMPLE_GRADE
        ? 'n/a'
        : formatFactor(factorId, limitOf(sample.commodity, full.grade, factorId)),
    binding: full.limitingFactors.some((entry) => entry.factor === factorId) ? 'yes' : '',
  }));
  return {
    number: number ?? sample.id,
    house: house ?? 'unnamed house',
    inspector: inspector ?? sample.grader ?? 'unsigned',
    issuedOn: issuedOn ?? sample.day,
    commodity: getCommodity(sample.commodity),
    sampleId: sample.id,
    grams: sample.grams,
    grade: full.grade,
    label: full.label,
    specialGrades: full.specialGrades,
    sampleGradeReasons: full.sampleGradeReasons,
    numericGrade: graded.grade,
    rows,
    moisture: typeof sample.moisture === 'number' ? sample.moisture : null,
    dockage: typeof sample.dockage === 'number' ? sample.dockage : null,
  };
}

function conditionsOf(sample) {
  const conditions = {};
  for (const [key, value] of Object.entries(sample)) {
    if (typeof value === 'boolean' || key.endsWith('Bulblets') || key.endsWith('Balls')) {
      conditions[key] = value;
    }
    if (key === 'liveWeevils' || key === 'otherLiveInsects' || key === 'ergotPercent') {
      conditions[key] = value;
    }
  }
  return conditions;
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
