import { GradeError } from '../core/errors.js';
import { assertCommodityId } from '../commodity/registry.js';

/**
 * The federal grade tables, one per commodity, transcribed from the United
 * States Standards for Grain.
 *
 * Corn and wheat run to five numeric grades. Soybeans and sorghum stop at four.
 * Anything that misses the last numeric grade is sample grade, and sample grade
 * has no limits of its own because it is what is left over.
 *
 * The wheat test weight column here is the one for all classes other than hard
 * red spring and white club, which is the column both of our wheats sit in.
 */

const TABLES = {
  corn: {
    commodity: 'corn',
    reference: 'US Standards for Corn',
    grades: [1, 2, 3, 4, 5],
    limits: {
      1: { testWeight: 56.0, damagedTotal: 3.0, heatDamaged: 0.1, bcfm: 2.0 },
      2: { testWeight: 54.0, damagedTotal: 5.0, heatDamaged: 0.2, bcfm: 3.0 },
      3: { testWeight: 52.0, damagedTotal: 7.0, heatDamaged: 0.5, bcfm: 4.0 },
      4: { testWeight: 49.0, damagedTotal: 10.0, heatDamaged: 1.0, bcfm: 5.0 },
      5: { testWeight: 46.0, damagedTotal: 15.0, heatDamaged: 3.0, bcfm: 7.0 },
    },
  },
  soybeans: {
    commodity: 'soybeans',
    reference: 'US Standards for Soybeans',
    grades: [1, 2, 3, 4],
    limits: {
      1: {
        testWeight: 56.0,
        damagedTotal: 2.0,
        heatDamaged: 0.2,
        foreignMaterial: 1.0,
        splits: 10.0,
        otherColors: 1.0,
      },
      2: {
        testWeight: 54.0,
        damagedTotal: 3.0,
        heatDamaged: 0.5,
        foreignMaterial: 2.0,
        splits: 20.0,
        otherColors: 2.0,
      },
      3: {
        testWeight: 52.0,
        damagedTotal: 5.0,
        heatDamaged: 1.0,
        foreignMaterial: 3.0,
        splits: 30.0,
        otherColors: 5.0,
      },
      4: {
        testWeight: 49.0,
        damagedTotal: 8.0,
        heatDamaged: 3.0,
        foreignMaterial: 5.0,
        splits: 40.0,
        otherColors: 10.0,
      },
    },
  },
  hrw: wheatTable('hrw', 'US Standards for Wheat'),
  srw: wheatTable('srw', 'US Standards for Wheat'),
  sorghum: {
    commodity: 'sorghum',
    reference: 'US Standards for Sorghum',
    grades: [1, 2, 3, 4],
    limits: {
      1: { testWeight: 57.0, damagedTotal: 2.0, heatDamaged: 0.2, bnfm: 4.0, foreignMaterial: 1.0 },
      2: { testWeight: 55.0, damagedTotal: 5.0, heatDamaged: 0.5, bnfm: 8.0, foreignMaterial: 2.0 },
      3: {
        testWeight: 53.0,
        damagedTotal: 10.0,
        heatDamaged: 1.0,
        bnfm: 12.0,
        foreignMaterial: 3.0,
      },
      4: {
        testWeight: 51.0,
        damagedTotal: 15.0,
        heatDamaged: 3.0,
        bnfm: 15.0,
        foreignMaterial: 4.0,
      },
    },
  },
};

function wheatTable(commodity, reference) {
  return {
    commodity,
    reference,
    grades: [1, 2, 3, 4, 5],
    limits: {
      1: {
        testWeight: 60.0,
        damagedTotal: 2.0,
        heatDamaged: 0.2,
        foreignMaterial: 0.4,
        shrunkenBroken: 3.0,
        defects: 3.0,
        wheatOtherClasses: 3.0,
        contrastingClasses: 1.0,
      },
      2: {
        testWeight: 58.0,
        damagedTotal: 4.0,
        heatDamaged: 0.2,
        foreignMaterial: 0.7,
        shrunkenBroken: 5.0,
        defects: 5.0,
        wheatOtherClasses: 5.0,
        contrastingClasses: 2.0,
      },
      3: {
        testWeight: 56.0,
        damagedTotal: 7.0,
        heatDamaged: 0.5,
        foreignMaterial: 1.3,
        shrunkenBroken: 8.0,
        defects: 8.0,
        wheatOtherClasses: 10.0,
        contrastingClasses: 3.0,
      },
      4: {
        testWeight: 54.0,
        damagedTotal: 10.0,
        heatDamaged: 1.0,
        foreignMaterial: 3.0,
        shrunkenBroken: 12.0,
        defects: 12.0,
        wheatOtherClasses: 10.0,
        contrastingClasses: 10.0,
      },
      5: {
        testWeight: 51.0,
        damagedTotal: 15.0,
        heatDamaged: 3.0,
        foreignMaterial: 5.0,
        shrunkenBroken: 20.0,
        defects: 20.0,
        wheatOtherClasses: 10.0,
        contrastingClasses: 10.0,
      },
    },
  };
}

for (const table of Object.values(TABLES)) {
  for (const limits of Object.values(table.limits)) Object.freeze(limits);
  Object.freeze(table.limits);
  Object.freeze(table.grades);
  Object.freeze(table);
}
Object.freeze(TABLES);

export const SAMPLE_GRADE = 'sample';

export function tableFor(commodityId) {
  const id = assertCommodityId(commodityId);
  return TABLES[id];
}

export function gradesFor(commodityId) {
  return tableFor(commodityId).grades;
}

export function lowestNumericGrade(commodityId) {
  const grades = gradesFor(commodityId);
  return grades[grades.length - 1];
}

export function limitsFor(commodityId, grade) {
  const table = tableFor(commodityId);
  const limits = table.limits[grade];
  if (!limits) {
    throw new GradeError('NO_SUCH_GRADE', `${table.commodity} has no US No. ${grade}`, {
      commodity: table.commodity,
      grade,
      grades: table.grades,
    });
  }
  return limits;
}

/** Which factors the table for this commodity actually constrains. */
export function factorsFor(commodityId) {
  const table = tableFor(commodityId);
  return Object.keys(table.limits[table.grades[0]]);
}

/** The limit for one factor at one grade, useful for printing a schedule. */
export function limitOf(commodityId, grade, factorId) {
  const limits = limitsFor(commodityId, grade);
  const limit = limits[factorId];
  if (limit === undefined) {
    throw new GradeError('FACTOR_NOT_IN_TABLE', `${factorId} is not in the ${commodityId} table`, {
      commodity: commodityId,
      factor: factorId,
    });
  }
  return limit;
}
