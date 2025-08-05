import { isArray } from '../core/assert.js';
import { percentOf, roundHalfUp } from '../core/numbers.js';
import { formatBushels } from '../core/money.js';
import { heading, renderTable } from '../core/text.js';
import { getFactor } from '../grading/factors.js';
import { factorsFor, gradesFor, SAMPLE_GRADE } from '../grading/standards.js';
import { gradeSample } from '../grading/special.js';

/**
 * What came in the door this season, by grade and by factor.
 *
 * The distribution answers the merchandiser's question, which is whether the
 * house can promise a buyer a train of number two. The factor table answers the
 * manager's, which is what is holding the crop back: a season where everything
 * is number three on test weight is a different problem from one where
 * everything is number three on damage.
 */

export function summariseFactor(values) {
  isArray(values, 'values');
  const clean = values.filter((value) => typeof value === 'number').sort((a, b) => a - b);
  if (clean.length === 0) {
    return { count: 0, min: null, max: null, mean: null, median: null, p90: null, spread: null };
  }
  const mean = clean.reduce((sum, value) => sum + value, 0) / clean.length;
  const variance = clean.reduce((sum, value) => sum + (value - mean) ** 2, 0) / clean.length;
  return {
    count: clean.length,
    min: clean[0],
    max: clean[clean.length - 1],
    mean: roundHalfUp(mean, 2),
    median: quantile(clean, 0.5),
    p90: quantile(clean, 0.9),
    spread: roundHalfUp(Math.sqrt(variance), 3),
  };
}

function quantile(sorted, share) {
  const position = (sorted.length - 1) * share;
  const low = Math.floor(position);
  const high = Math.ceil(position);
  if (low === high) return roundHalfUp(sorted[low], 3);
  return roundHalfUp(sorted[low] + (sorted[high] - sorted[low]) * (position - low), 3);
}

/** Grade every sample and count them, carrying the bushels behind each grade. */
export function gradeDistribution(loads, commodityId) {
  isArray(loads, 'loads');
  const counts = new Map();
  for (const grade of [...gradesFor(commodityId), SAMPLE_GRADE]) {
    counts.set(grade, { grade, loads: 0, bushels: 0 });
  }
  for (const load of loads) {
    const graded = gradeSample(commodityId, load.sample);
    const row = counts.get(graded.grade);
    row.loads += 1;
    row.bushels += load.bushels ?? 0;
  }
  const totalLoads = loads.length;
  const totalBushels = [...counts.values()].reduce((sum, row) => sum + row.bushels, 0);
  return [...counts.values()].map((row) => ({
    ...row,
    label: row.grade === SAMPLE_GRADE ? 'Sample' : `US ${row.grade}`,
    loadPercent: percentOf(row.loads, totalLoads, 1),
    bushelPercent: percentOf(row.bushels, totalBushels, 1),
  }));
}

export function factorTable(loads, commodityId) {
  return factorsFor(commodityId).map((factorId) => ({
    factor: getFactor(factorId).label,
    ...summariseFactor(loads.map((load) => load.sample[factorId])),
  }));
}

export function renderGradeReport(loads, commodityId, { house = 'unnamed house', season } = {}) {
  const distribution = gradeDistribution(loads, commodityId);
  const factors = factorTable(loads, commodityId);
  return [
    heading(`${house} ${commodityId} grades ${season ?? ''}`.trim()),
    '',
    renderTable(
      [
        { header: 'grade', key: 'label' },
        { header: 'loads', key: 'loads', align: 'right' },
        { header: 'pct', value: (row) => row.loadPercent.toFixed(1), align: 'right' },
        { header: 'bushels', value: (row) => formatBushels(row.bushels), align: 'right' },
      ],
      distribution
    ),
    '',
    renderTable(
      [
        { header: 'factor', key: 'factor' },
        { header: 'n', key: 'count', align: 'right' },
        { header: 'min', value: (row) => String(row.min ?? ''), align: 'right' },
        { header: 'mean', value: (row) => String(row.mean ?? ''), align: 'right' },
        { header: 'p90', value: (row) => String(row.p90 ?? ''), align: 'right' },
        { header: 'max', value: (row) => String(row.max ?? ''), align: 'right' },
      ],
      factors
    ),
  ].join('\n');
}

/** The factor that put the most loads into a lower grade. */
export function worstFactor(loads, commodityId) {
  const counts = new Map();
  for (const load of loads) {
    const graded = gradeSample(commodityId, load.sample);
    if (graded.grade === gradesFor(commodityId)[0]) continue;
    for (const limiting of graded.limitingFactors) {
      counts.set(limiting.factor, (counts.get(limiting.factor) ?? 0) + 1);
    }
  }
  if (counts.size === 0) return null;
  const [factor, loadsHeld] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
  return { factor, label: getFactor(factor).label, loads: loadsHeld };
}
