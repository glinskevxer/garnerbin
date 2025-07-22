import { describe, expect, it } from 'vitest';
import { assertValid, defineSchema, TYPES, validate } from '../../src/io/schema.js';

const houseSchema = defineSchema({
  name: { type: 'string', required: true },
  opened: { type: 'day', required: true },
  bins: { type: 'integer', required: true, min: 1 },
  shrinkFactor: { type: 'number', default: 1.4, min: 1, max: 2 },
  commodities: { type: 'array', of: { type: 'string' } },
  hedged: { type: 'boolean', default: false },
});

describe('defining a schema', () => {
  it('knows the types it can check', () => {
    expect(TYPES).toContain('day');
    expect(() => defineSchema({ a: { type: 'colour' } })).toThrow(/declared as colour/);
  });
});

describe('validating', () => {
  it('passes a good document and fills the defaults', () => {
    const outcome = validate(houseSchema, {
      name: 'Rush Creek',
      opened: '1974-08-01',
      bins: 12,
    });
    expect(outcome.ok).toBe(true);
    expect(outcome.value.shrinkFactor).toBe(1.4);
    expect(outcome.value.hedged).toBe(false);
  });

  it('names every field that is missing', () => {
    const outcome = validate(houseSchema, {});
    expect(outcome.ok).toBe(false);
    expect(outcome.errors).toContain('name is required');
    expect(outcome.errors).toContain('bins is required');
  });

  it('collects the problems instead of stopping at the first', () => {
    const outcome = validate(houseSchema, { name: 7, opened: 'August', bins: 0 });
    expect(outcome.errors).toHaveLength(3);
  });

  it('checks the bounds', () => {
    expect(validate(houseSchema, houseWith({ shrinkFactor: 2.5 })).errors).toContain(
      'shrinkFactor must be at most 2'
    );
    expect(validate(houseSchema, houseWith({ bins: 0 })).errors).toContain(
      'bins must be at least 1'
    );
  });

  it('checks a day is a real day', () => {
    expect(validate(houseSchema, houseWith({ opened: '1974-02-30' })).errors).toContain(
      'opened must be a day'
    );
  });

  it('checks inside an array', () => {
    const outcome = validate(houseSchema, houseWith({ commodities: ['corn', 7] }));
    expect(outcome.errors).toContain('commodities.1 must be a string');
  });

  it('refuses a field nobody declared', () => {
    expect(validate(houseSchema, houseWith({ colour: 'red' })).errors).toContain(
      'colour is not a field here'
    );
  });

  it('walks into a nested shape', () => {
    const nested = defineSchema({
      terms: {
        type: 'object',
        required: true,
        shape: { rate: { type: 'number', required: true } },
      },
    });
    expect(validate(nested, { terms: {} }).errors).toContain('terms.rate is required');
    expect(validate(nested, { terms: { rate: 1 } }).ok).toBe(true);
  });

  it('refuses a document that is not an object at all', () => {
    expect(validate(houseSchema, 'nope').errors).toContain('the document must be an object');
  });
});

function houseWith(overrides) {
  return { name: 'Rush Creek', opened: '1974-08-01', bins: 12, ...overrides };
}

describe('assertValid', () => {
  it('gives the value back when it passes', () => {
    expect(assertValid(houseSchema, houseWith({})).name).toBe('Rush Creek');
  });

  it('throws with every problem in the message', () => {
    try {
      assertValid(houseSchema, {}, 'the house file');
    } catch (err) {
      expect(err.code).toBe('SCHEMA_FAILED');
      expect(err.message).toContain('the house file is not usable');
      expect(err.details.errors.length).toBeGreaterThan(1);
    }
  });
});
