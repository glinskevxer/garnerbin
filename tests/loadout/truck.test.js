import { describe, expect, it } from 'vitest';
import { formatBushels } from '../../src/core/money.js';
import {
  axleGroupLimit,
  bridgeFormulaWeight,
  bushelsForTruck,
  describeRig,
  dropBushels,
  GROSS_LIMIT_LB,
  legalGross,
  legalPayload,
  overweightBy,
  SINGLE_AXLE_LB,
  TANDEM_AXLE_LB,
} from '../../src/loadout/truck.js';

const semi = { axles: 5, outerSpacingFeet: 51, groups: [1, 2, 2], tarePounds: 30_000 };
const straight = { axles: 3, outerSpacingFeet: 20, groups: [1, 2], tarePounds: 22_000 };

describe('the bridge formula', () => {
  it('gives a five axle rig at fifty one feet the full eighty thousand', () => {
    expect(bridgeFormulaWeight(5, 51)).toBe(GROSS_LIMIT_LB);
  });

  it('holds a short rig well under it', () => {
    expect(bridgeFormulaWeight(3, 20)).toBe(51_000);
    expect(bridgeFormulaWeight(5, 30)).toBe(67_000);
  });

  it('rounds down to the nearest five hundred', () => {
    expect(bridgeFormulaWeight(4, 27) % 500).toBe(0);
  });

  it('never goes over the gross limit', () => {
    expect(bridgeFormulaWeight(9, 80)).toBe(GROSS_LIMIT_LB);
  });

  it('refuses a group it does not cover', () => {
    expect(() => bridgeFormulaWeight(1, 20)).toThrow(/between 2 and 9/);
  });
});

describe('axle group limits', () => {
  it('posts the three the code carries', () => {
    expect(axleGroupLimit(1)).toBe(SINGLE_AXLE_LB);
    expect(axleGroupLimit(2)).toBe(TANDEM_AXLE_LB);
    expect(axleGroupLimit(3)).toBe(42_000);
  });

  it('refuses a group with no posted limit', () => {
    expect(() => axleGroupLimit(4)).toThrow(/no posted limit for a group of 4/);
  });
});

describe('the legal gross', () => {
  it('takes the lowest of the three and says which', () => {
    const result = legalGross(semi);
    expect(result.pounds).toBe(80_000);
    expect(result.because).toBe('the gross limit');
  });

  it('is bridge limited on a short rig', () => {
    const result = legalGross(straight);
    expect(result.pounds).toBe(51_000);
    expect(result.because).toBe('the bridge formula');
  });

  it('is axle limited when the groups do not add up', () => {
    const result = legalGross({ axles: 5, outerSpacingFeet: 51, groups: [1, 2, 1] });
    expect(result.because).toBe('the axle limits');
    expect(result.pounds).toBe(74_000);
  });

  it('assumes the gross limit when nobody described the groups', () => {
    expect(legalGross({ axles: 5, outerSpacingFeet: 51 }).pounds).toBe(80_000);
  });
});

describe('the payload', () => {
  it('is the legal gross less the tare', () => {
    expect(legalPayload(semi).payloadPounds).toBe(50_000);
    expect(legalPayload(straight).payloadPounds).toBe(29_000);
  });

  it('refuses a rig that has nothing left', () => {
    expect(() => legalPayload({ ...semi, tarePounds: 90_000 })).toThrow(/leaves nothing under/);
  });

  it('turns the payload into bushels', () => {
    expect(formatBushels(bushelsForTruck(semi, 'corn').bushels)).toBe('892.85');
    expect(formatBushels(bushelsForTruck(semi, 'soybeans').bushels)).toBe('833.33');
  });

  it('says what is holding the load', () => {
    expect(describeRig(semi, 'corn')).toContain('held by the gross limit');
    expect(describeRig(straight, 'corn')).toContain('held by the bridge formula');
  });
});

describe('a truck that came in heavy', () => {
  it('says it is legal when it is', () => {
    const state = overweightBy(semi, 79_000);
    expect(state.legal).toBe(true);
    expect(state.over).toBe(0);
  });

  it('says how far over and why', () => {
    const state = overweightBy(semi, 82_400);
    expect(state.legal).toBe(false);
    expect(state.over).toBe(2400);
    expect(state.because).toBe('the gross limit');
  });

  it('turns the overage into bushels to come off', () => {
    expect(formatBushels(dropBushels(semi, 82_400, 'corn'))).toBe('42.85');
    expect(dropBushels(semi, 79_000, 'corn')).toBe(0);
  });
});
