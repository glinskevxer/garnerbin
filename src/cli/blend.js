import { ConfigError } from '../core/errors.js';
import { bushelsFromDecimal, formatBushels } from '../core/money.js';
import { heading, keyValue, renderTable } from '../core/text.js';
import { getFactor } from '../grading/factors.js';
import { gradeLabel } from '../grading/grade.js';
import { readingsOf } from '../grading/sample.js';
import { blendCapacity, blendReadings, gradeOfBlend, planBlend } from '../inventory/blend.js';
import { readSamples } from './desk.js';

/**
 * The blend calculator.
 *
 * Two lots, a target grade, and the answer to the only question anybody asks
 * about blending. It prints the binding factor as well as the number, because
 * the number on its own tells the loader nothing about what to do if he wants a
 * bigger one.
 */

function lotFrom(samples, id, bushels, label) {
  const sample = samples.find((entry) => entry.id === id);
  if (!sample) {
    throw new ConfigError('NO_SUCH_SAMPLE', `there is no sample ${id} in that file`, {
      sample: id,
      which: label,
    });
  }
  if (!(bushels > 0)) {
    throw new ConfigError('NO_BUSHELS', `give the bushels behind the ${label} lot`, {
      which: label,
    });
  }
  return { id, bushels: bushelsFromDecimal(bushels), readings: readingsOf(sample), sample };
}

export function runBlend(options) {
  const samples = readSamples(options.samples).records;
  const base = lotFrom(samples, options.base, Number(options.baseBushels), 'base');
  const addition = lotFrom(samples, options.add, Number(options.addBushels), 'addition');
  if (base.sample.commodity !== addition.sample.commodity) {
    throw new ConfigError('MIXED_BLEND', 'the two lots are not the same grain', {
      base: base.sample.commodity,
      addition: addition.sample.commodity,
    });
  }
  const commodity = base.sample.commodity;
  const target = Number(options.target ?? 2);
  const capacity = blendCapacity(base, addition, commodity, target);

  const lines = [
    heading(`Blending ${addition.id} into ${base.id}`),
    keyValue([
      ['Grain', commodity],
      ['Target', gradeLabel(target)],
      [
        'Base',
        `${formatBushels(base.bushels)} at ${gradeLabel(gradeOfBlend([base], commodity).grade)}`,
      ],
      [
        'Addition',
        `${formatBushels(addition.bushels)} at ${gradeLabel(gradeOfBlend([addition], commodity).grade)}`,
      ],
    ]),
  ];

  if (capacity.bushels === 0) {
    lines.push(
      '',
      `Nothing will blend. ${getFactor(capacity.bindingFactor).label} on the base is already past the limit.`
    );
    return { capacity, plan: null, text: lines.join('\n') };
  }

  const plan = planBlend(base, addition, commodity, target);
  const readings = blendReadings(plan.lots, commodity);
  lines.push(
    '',
    keyValue([
      ['Will take', formatBushels(plan.bushels)],
      ['Blend total', formatBushels(plan.totalBushels)],
      ['Blend grades', gradeLabel(plan.grade)],
      ['Held by', plan.unlimited ? 'nothing, it all goes in' : getFactor(plan.bindingFactor).label],
    ]),
    '',
    renderTable(
      [
        { header: 'factor', key: 'factor' },
        { header: 'base', key: 'base', align: 'right' },
        { header: 'addition', key: 'addition', align: 'right' },
        { header: 'blend', key: 'blend', align: 'right' },
      ],
      Object.keys(readings).map((factorId) => ({
        factor: getFactor(factorId).label,
        base: String(base.readings[factorId] ?? ''),
        addition: String(addition.readings[factorId] ?? ''),
        blend: String(readings[factorId]),
      }))
    )
  );
  return { capacity, plan, text: lines.join('\n') };
}

export function register(program) {
  program
    .command('blend')
    .description('work out how much of one lot will blend into another and still make grade')
    .requiredOption('-s, --samples <path>', 'a sample extract')
    .requiredOption('--base <sample>', 'the sample for the good lot')
    .requiredOption('--base-bushels <bushels>', 'how many bushels of it there are')
    .requiredOption('--add <sample>', 'the sample for the lot going in')
    .requiredOption('--add-bushels <bushels>', 'how many bushels of it there are')
    .option('--target <grade>', 'the grade to hold', '2')
    .action((options) => {
      console.log(runBlend(options).text);
    });
}
