import { describe, expect, it } from 'vitest';
import { Command } from 'commander';
import { fileURLToPath } from 'node:url';
import { addBidOptions, addDeskOptions, bidFor, wantsSettlement } from '../../src/cli/options.js';

const example = (name) => fileURLToPath(new URL(`../../examples/${name}`, import.meta.url));

function flagsOf(command) {
  return command.options.map((option) => option.long);
}

describe('the shared options', () => {
  it('adds the desk options to a command', () => {
    const command = addDeskOptions(new Command('x'));
    expect(flagsOf(command)).toEqual(['--house', '--tickets', '--samples']);
  });

  it('leaves the samples option off when a command does not settle', () => {
    const command = addDeskOptions(new Command('x'), { samples: false });
    expect(flagsOf(command)).toEqual(['--house', '--tickets']);
  });

  it('adds the bid options to a command', () => {
    const command = addBidOptions(new Command('x'));
    expect(flagsOf(command)).toEqual(['--bid', '--board', '--basis', '--period', '--day']);
  });
});

describe('working out the bid', () => {
  it('takes a posted bid straight', () => {
    expect(bidFor({ bid: '4.2750' }, 'corn')).toBe(42_750);
  });

  it('prices off the board and the basis', () => {
    expect(
      bidFor(
        {
          board: example('board-2025-10-09.csv'),
          basis: example('basis-2025-10-09.csv'),
          period: '2025-10',
          day: '2025-10-09',
        },
        'soybeans'
      )
    ).toBe(95_700);
  });

  it('refuses when it has neither', () => {
    expect(() => bidFor({}, 'corn')).toThrow(/give a bid, or a board and a basis/);
  });

  it('refuses a board with no day', () => {
    expect(() =>
      bidFor(
        {
          board: example('board-2025-10-09.csv'),
          basis: example('basis-2025-10-09.csv'),
          period: '2025-10',
        },
        'corn'
      )
    ).toThrow(/need the day they are for/);
  });
});

describe('whether a command should settle', () => {
  it('needs samples and a price of some kind', () => {
    expect(wantsSettlement({ samples: 'x', bid: '4.2750' })).toBe(true);
    expect(wantsSettlement({ samples: 'x', board: 'y' })).toBe(true);
    expect(wantsSettlement({ samples: 'x' })).toBe(false);
    expect(wantsSettlement({ bid: '4.2750' })).toBe(false);
    expect(wantsSettlement({})).toBe(false);
  });
});
