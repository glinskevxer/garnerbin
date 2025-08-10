import { ConfigError } from '../core/errors.js';
import { isPlainObject, isString } from '../core/assert.js';
import { assertDay } from '../core/dates.js';
import { assertCommodityId } from '../commodity/registry.js';
import { createBin } from '../inventory/bins.js';
import { createDryingSchedule } from '../weights/drying.js';
import { createDiscountSchedule } from '../pricing/discounts.js';
import { createStorageTerms } from '../storage/accrual.js';
import { createDpTerms } from '../contracts/dp.js';
import { checkoffFor, createAssessment } from '../settlement/deductions.js';
import { defineSchema, validate } from '../io/schema.js';

/**
 * The house file.
 *
 * One document describes a country elevator: what it takes, what it charges,
 * what it can hold and which days it is shut. Everything downstream reads its
 * rates from here rather than carrying a default, because a house that quietly
 * falls back to a built in shrink factor will settle a whole harvest wrong and
 * nobody will notice until the audit.
 */

export const HOUSE_SCHEMA = defineSchema({
  name: { type: 'string', required: true },
  commodities: { type: 'array', required: true, of: { type: 'string' } },
  shrinkFactor: { type: 'number', default: 1.4, min: 1, max: 2 },
  handlingPercent: { type: 'number', default: 0 },
  holidays: { type: 'array', of: { type: 'day' } },
  bins: { type: 'array', required: true },
  drying: { type: 'object' },
  discounts: { type: 'object' },
  storage: { type: 'object' },
  delayedPrice: { type: 'object' },
  assessments: { type: 'array' },
});

export function loadHouse(document) {
  isPlainObject(document, 'house');
  const checked = validate(HOUSE_SCHEMA, document);
  if (!checked.ok) {
    throw new ConfigError(
      'BAD_HOUSE_FILE',
      `the house file is not usable: ${checked.errors.join('; ')}`,
      {
        errors: checked.errors,
      }
    );
  }
  const commodities = checked.value.commodities.map((id) => assertCommodityId(id));
  if (commodities.length === 0) {
    throw new ConfigError('NO_COMMODITIES', 'a house has to take something', {});
  }
  const bins = checked.value.bins.map((bin) => createBin(bin));
  const holidays = (checked.value.holidays ?? []).map((day) => assertDay(day, 'holiday'));

  const drying = {};
  for (const [id, schedule] of Object.entries(document.drying ?? {})) {
    assertCommodityId(id);
    drying[id] = createDryingSchedule({ id: `${id}-drying`, ...schedule });
  }
  const discounts = {};
  for (const [id, schedule] of Object.entries(document.discounts ?? {})) {
    discounts[id] = createDiscountSchedule({ id: `${id}-discounts`, commodity: id, ...schedule });
  }

  const assessments = (document.assessments ?? []).map((entry) =>
    entry.checkoffFor ? checkoffFor(assertCommodityId(entry.checkoffFor)) : createAssessment(entry)
  );

  return Object.freeze({
    name: isString(checked.value.name, 'name'),
    commodities: Object.freeze(commodities),
    shrinkFactor: checked.value.shrinkFactor,
    handlingPercent: checked.value.handlingPercent,
    holidays: Object.freeze(holidays),
    bins: Object.freeze(bins),
    drying: Object.freeze(drying),
    discounts: Object.freeze(discounts),
    storage: document.storage ? createStorageTerms(document.storage) : null,
    delayedPrice: document.delayedPrice ? createDpTerms(document.delayedPrice) : null,
    assessments: Object.freeze(assessments),
  });
}

export function binOf(house, id) {
  const found = house.bins.find((bin) => bin.id === id);
  if (!found) {
    throw new ConfigError('NO_SUCH_BIN', `${house.name} has no bin ${id}`, {
      house: house.name,
      bin: id,
      bins: house.bins.map((bin) => bin.id),
    });
  }
  return found;
}

export function takes(house, commodityId) {
  return house.commodities.includes(assertCommodityId(commodityId));
}

export function assertTakes(house, commodityId) {
  if (!takes(house, commodityId)) {
    throw new ConfigError('COMMODITY_NOT_TAKEN', `${house.name} does not take ${commodityId}`, {
      house: house.name,
      commodity: commodityId,
      commodities: house.commodities,
    });
  }
  return commodityId;
}

export function dryingFor(house, commodityId) {
  return house.drying[assertCommodityId(commodityId)] ?? null;
}

export function discountsFor(house, commodityId) {
  return house.discounts[assertCommodityId(commodityId)] ?? null;
}

export function houseSummary(house) {
  return {
    name: house.name,
    commodities: house.commodities.join(', '),
    bins: house.bins.length,
    shrinkFactor: house.shrinkFactor,
    hasDrying: Object.keys(house.drying).length > 0,
    hasDiscounts: Object.keys(house.discounts).length > 0,
    hasStorage: house.storage !== null,
  };
}
