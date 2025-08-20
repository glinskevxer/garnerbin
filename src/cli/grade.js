import { ConfigError } from '../core/errors.js';
import { heading, renderTable } from '../core/text.js';
import { certificateFor } from '../grading/certificate.js';
import { gradeSample } from '../grading/special.js';
import { gradeDistribution, worstFactor } from '../report/grades.js';
import { readHouse, readSamples } from './desk.js';

/**
 * Grade the samples in a file.
 *
 * With an id it prints the certificate for that one sample, which is what the
 * grader wants when a hauler is standing at the window. Without one it prints
 * the whole file as a table with the distribution under it, which is what the
 * merchandiser wants at the end of the day.
 */

export function runGrade(options) {
  const house = options.house ? readHouse(options.house) : null;
  const samples = readSamples(options.samples);
  if (samples.problems.length > 0 && options.strict) {
    throw new ConfigError('BAD_SAMPLES', `${samples.problems.length} samples would not build`, {
      problems: samples.problems,
    });
  }
  const wanted = options.id
    ? samples.records.filter((sample) => sample.id === options.id)
    : samples.records.filter(
        (sample) => !options.commodity || sample.commodity === options.commodity
      );
  if (wanted.length === 0) {
    throw new ConfigError('NO_SAMPLES', 'no sample in that file matches', {
      id: options.id ?? null,
      commodity: options.commodity ?? null,
    });
  }
  if (options.id) {
    return {
      text: certificateFor(wanted[0], { house: house?.name }),
      graded: wanted.map((sample) => gradeSample(sample.commodity, sample)),
    };
  }
  const rows = wanted.map((sample) => {
    const graded = gradeSample(sample.commodity, sample);
    return {
      id: sample.id,
      commodity: sample.commodity,
      grade: graded.label,
      moisture: typeof sample.moisture === 'number' ? sample.moisture.toFixed(1) : '',
      holding: graded.limitingFactors.map((entry) => entry.factor).join(' '),
    };
  });
  const lines = [
    heading(`${house?.name ?? 'Samples'} grades`),
    '',
    renderTable(
      [
        { header: 'sample', key: 'id' },
        { header: 'grain', key: 'commodity' },
        { header: 'grade', key: 'grade' },
        { header: 'moisture', key: 'moisture', align: 'right' },
        { header: 'held by', key: 'holding' },
      ],
      rows
    ),
  ];
  const byCommodity = [...new Set(wanted.map((sample) => sample.commodity))];
  for (const commodity of byCommodity) {
    const loads = wanted
      .filter((sample) => sample.commodity === commodity)
      .map((sample) => ({ sample, bushels: 0 }));
    const distribution = gradeDistribution(loads, commodity).filter((row) => row.loads > 0);
    lines.push(
      '',
      `${commodity}: ${distribution.map((row) => `${row.label} x${row.loads}`).join(', ')}`
    );
    const worst = worstFactor(loads, commodity);
    if (worst) lines.push(`  most often held by ${worst.label.toLowerCase()}`);
  }
  return {
    text: lines.join('\n'),
    graded: wanted.map((sample) => gradeSample(sample.commodity, sample)),
  };
}

export function register(program) {
  program
    .command('grade')
    .description('grade the samples in a file, or print one certificate')
    .requiredOption('-s, --samples <path>', 'a sample extract')
    .option('-c, --house <path>', 'the house configuration file')
    .option('-i, --id <sample>', 'print the certificate for one sample')
    .option('--commodity <id>', 'only this commodity')
    .option('--strict', 'refuse a file with rows that would not build', false)
    .action((options) => {
      console.log(runGrade(options).text);
    });
}
