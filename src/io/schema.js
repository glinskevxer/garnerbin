import { ConfigError } from '../core/errors.js';
import { isPlainObject } from '../core/assert.js';
import { assertDay } from '../core/dates.js';

/**
 * A small schema for the configuration files.
 *
 * This is not a general purpose validator and it is not trying to be. It covers
 * the shapes the office configuration actually uses, it collects every problem
 * rather than stopping at the first, and it names the path to each one, because
 * a message that says a number was expected without saying where is no better
 * than no message at all.
 */

const CHECKS = {
  string: (value) => typeof value === 'string',
  number: (value) => typeof value === 'number' && Number.isFinite(value),
  integer: (value) => Number.isInteger(value),
  boolean: (value) => typeof value === 'boolean',
  array: (value) => Array.isArray(value),
  object: (value) => value !== null && typeof value === 'object' && !Array.isArray(value),
  day: (value) => {
    if (typeof value !== 'string') return false;
    try {
      assertDay(value);
      return true;
    } catch {
      return false;
    }
  },
};

export const TYPES = Object.freeze(Object.keys(CHECKS));

export function defineSchema(fields) {
  isPlainObject(fields, 'fields');
  for (const [name, rule] of Object.entries(fields)) {
    if (!CHECKS[rule.type]) {
      throw new ConfigError('NO_SUCH_TYPE', `${name} is declared as ${rule.type}`, {
        field: name,
        type: rule.type,
      });
    }
  }
  return Object.freeze({ ...fields });
}

function checkOne(name, rule, value, path, errors) {
  const where = path ? `${path}.${name}` : name;
  if (value === undefined || value === null) {
    if (rule.required) errors.push(`${where} is required`);
    return rule.default;
  }
  if (!CHECKS[rule.type](value)) {
    errors.push(`${where} must be a ${rule.type}`);
    return value;
  }
  if (rule.values && !rule.values.includes(value)) {
    errors.push(`${where} must be one of ${rule.values.join(', ')}`);
  }
  if (rule.min !== undefined && value < rule.min)
    errors.push(`${where} must be at least ${rule.min}`);
  if (rule.max !== undefined && value > rule.max)
    errors.push(`${where} must be at most ${rule.max}`);
  if (rule.type === 'array' && rule.of) {
    value.forEach((entry, index) => {
      checkOne(String(index), rule.of, entry, where, errors);
    });
  }
  if (rule.type === 'object' && rule.shape) {
    walk(rule.shape, value, where, errors);
  }
  return value;
}

function walk(schema, value, path, errors) {
  const result = {};
  if (!CHECKS.object(value)) {
    errors.push(`${path || 'the document'} must be an object`);
    return result;
  }
  for (const [name, rule] of Object.entries(schema)) {
    const checked = checkOne(name, rule, value[name], path, errors);
    if (checked !== undefined) result[name] = checked;
  }
  for (const name of Object.keys(value)) {
    if (!(name in schema)) errors.push(`${path ? `${path}.` : ''}${name} is not a field here`);
  }
  return result;
}

export function validate(schema, value) {
  const errors = [];
  const result = walk(schema, value, '', errors);
  return { ok: errors.length === 0, errors, value: result };
}

export function assertValid(schema, value, what = 'the document') {
  const outcome = validate(schema, value);
  if (!outcome.ok) {
    throw new ConfigError('SCHEMA_FAILED', `${what} is not usable: ${outcome.errors.join('; ')}`, {
      errors: outcome.errors,
    });
  }
  return outcome.value;
}
