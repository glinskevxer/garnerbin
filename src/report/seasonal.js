import { isArray, isPlainObject } from '../core/assert.js';
import { percentOf, roundHalfUp } from '../core/numbers.js';
import { bushelsToDecimal, formatBushels, formatMoney, formatPrice } from '../core/money.js';
import { cropYear, monthKey } from '../core/dates.js';
import { heading, keyValue, renderTable } from '../core/text.js';
import { cropYearStartMonth } from '../commodity/registry.js';
import { SAMPLE_GRADE } from '../grading/standards.js';

/**
 * What a season looked like, once it is over.
 *
 * The manager reads three things off this: how much came in and when, what it
 * graded, and what the shrink and the discounts actually earned. The third one
 * is the one nobody has by any other route, because it only exists as the
 * difference between two numbers that live on different sheets.
 */

export function buildSeason(input) {
  isPlainObject(input, 'season');
  const settlements = isArray(input.settlements, 'settlements', { minLength: 1 });
  const commodity = input.commodity ?? settlements[0].commodity;
  const forCommodity = settlements.filter((entry) => entry.commodity === commodity);
  const year = cropYear(input.asOf ?? forCommodity[0].day, cropYearStartMonth(commodity));

  const byMonth = new Map();
  const byGrade = new Map();
  let grossBushels = 0;
  let netBushels = 0;
  let netCents = 0;
  let discountCents = 0;
  let dryingCents = 0;
  let moistureProduct = 0;

  for (const settlement of forCommodity) {
    const month = monthKey(settlement.day);
    const monthRow = byMonth.get(month) ?? { month, loads: 0, grossBushels: 0, netBushels: 0 };
    monthRow.loads += 1;
    monthRow.grossBushels += settlement.weights.grossBushels;
    monthRow.netBushels += settlement.weights.netBushels;
    byMonth.set(month, monthRow);

    const grade = settlement.grade.grade;
    byGrade.set(grade, (byGrade.get(grade) ?? 0) + settlement.weights.netBushels);

    grossBushels += settlement.weights.grossBushels;
    netBushels += settlement.weights.netBushels;
    netCents += settlement.netCents;
    discountCents += settlement.discountCents;
    dryingCents += settlement.drying.cents;
    moistureProduct += settlement.weights.moisture * settlement.weights.grossBushels;
  }

  return {
    commodity,
    cropYear: year.label,
    from: year.start,
    to: year.end,
    loads: forCommodity.length,
    grossBushels,
    netBushels,
    keptBushels: grossBushels - netBushels,
    keptPercent: percentOf(
      bushelsToDecimal(grossBushels - netBushels),
      bushelsToDecimal(grossBushels),
      3
    ),
    netCents,
    discountCents,
    dryingCents,
    averageMoisture: grossBushels === 0 ? 0 : roundHalfUp(moistureProduct / grossBushels, 1),
    averagePricePoints: netBushels === 0 ? 0 : Math.round((netCents * 10_000) / netBushels),
    months: [...byMonth.values()].sort((a, b) => a.month.localeCompare(b.month)),
    grades: [...byGrade.entries()]
      .map(([grade, bushels]) => ({
        grade,
        label: grade === SAMPLE_GRADE ? 'Sample' : `US ${grade}`,
        bushels,
        share: percentOf(bushelsToDecimal(bushels), bushelsToDecimal(netBushels), 1),
      }))
      .sort((a, b) => String(a.grade).localeCompare(String(b.grade))),
  };
}

export function renderSeason(season) {
  return [
    heading(`${season.commodity} ${season.cropYear}`),
    keyValue([
      ['Loads', String(season.loads)],
      ['Gross bushels', formatBushels(season.grossBushels)],
      ['Settlement bushels', formatBushels(season.netBushels)],
      [
        'Kept as shrink and dockage',
        `${formatBushels(season.keptBushels)} (${season.keptPercent} percent)`,
      ],
      ['Average moisture', String(season.averageMoisture)],
      ['Average price paid', formatPrice(season.averagePricePoints)],
      ['Discounts', formatMoney(season.discountCents)],
      ['Drying', formatMoney(season.dryingCents)],
      ['Paid out', formatMoney(season.netCents)],
    ]),
    '',
    renderTable(
      [
        { header: 'month', key: 'month' },
        { header: 'loads', key: 'loads', align: 'right' },
        { header: 'gross', value: (row) => formatBushels(row.grossBushels), align: 'right' },
        { header: 'settled', value: (row) => formatBushels(row.netBushels), align: 'right' },
      ],
      season.months
    ),
    '',
    renderTable(
      [
        { header: 'grade', key: 'label' },
        { header: 'bushels', value: (row) => formatBushels(row.bushels), align: 'right' },
        { header: 'share', value: (row) => `${row.share}`, align: 'right' },
      ],
      season.grades
    ),
  ].join('\n');
}

/** What the house kept, and what it earned on the two things it charges for. */
export function marginOf(season) {
  return {
    shrinkBushels: season.keptBushels,
    shrinkPercent: season.keptPercent,
    discountCents: season.discountCents,
    dryingCents: season.dryingCents,
    chargedCents: season.discountCents + season.dryingCents,
  };
}

export function compareSeasons(earlier, later) {
  return {
    commodity: later.commodity,
    from: earlier.cropYear,
    to: later.cropYear,
    bushelChange: later.netBushels - earlier.netBushels,
    moistureChange: roundHalfUp(later.averageMoisture - earlier.averageMoisture, 1),
    shrinkChange: roundHalfUp(later.keptPercent - earlier.keptPercent, 3),
    priceChange: later.averagePricePoints - earlier.averagePricePoints,
  };
}
