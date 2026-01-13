import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { runValidate } from '../../src/cli/validate.js';
import { sampleForTicket, sampleIndex } from '../../src/grading/sample.js';
import { readHouse } from '../../src/cli/desk.js';

const example = (name) => fileURLToPath(new URL(`../../examples/${name}`, import.meta.url));

describe('reading the desk', () => {
  it('reads the house file', () => {
    expect(readHouse(example('rush-creek.json')).name).toBe('Rush Creek Grain');
  });

  it('says which file is missing', () => {
    expect(() => readHouse(example('nowhere.json'))).toThrow(/no house file at/);
  });

  it('says when a ticket names a sample that is not in the file', () => {
    const index = sampleIndex([]);
    expect(() => sampleForTicket(index, { number: 'T-1', sampleId: 'S-9' })).toThrow(
      /names sample S-9, which is not in the file/
    );
  });

  it('says when a ticket names no sample at all', () => {
    expect(() => sampleForTicket(sampleIndex([]), { number: 'T-1' })).toThrow(/names no sample/);
  });
});

describe('validate', () => {
  it('prints the house and finds nothing wrong with the worked day', () => {
    const result = runValidate({
      house: example('rush-creek.json'),
      tickets: example('tickets-2025-10-09.csv'),
      samples: example('samples-2025-10-09.csv'),
    });
    expect(result.problems).toEqual([]);
    expect(result.text).toContain('Rush Creek Grain configuration');
    expect(result.text).toContain('8 tickets read');
    expect(result.text).toContain('7 samples read');
    expect(result.text).toContain('Nothing to fix.');
  });

  it('lists the bins with what they hold', () => {
    const result = runValidate({ house: example('rush-creek.json') });
    expect(result.text).toContain('B-4');
    expect(result.text).toContain('anything');
  });

  it('works with only a house file', () => {
    const result = runValidate({ house: example('rush-creek.json') });
    expect(result.problems).toEqual([]);
  });
});
