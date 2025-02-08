import { describe, expect, it } from 'vitest';
import {
  assertCommodityId,
  COMMODITY_IDS,
  cropYearStartMonth,
  getCommodity,
  hasOwnFutures,
  hedgeSymbol,
  isWheat,
  legalWeight,
  listCommodities,
  marketMoisture,
  moisturePointsOver,
  willStore,
} from '../../src/commodity/registry.js';

describe('the registry', () => {
  it('carries the five things the house takes', () => {
    expect(COMMODITY_IDS).toEqual(['corn', 'soybeans', 'hrw', 'srw', 'sorghum']);
    expect(listCommodities()).toHaveLength(5);
  });

  it('looks one up whatever case it was typed in', () => {
    expect(getCommodity('CORN').id).toBe('corn');
    expect(getCommodity('Soybeans').name).toBe('Yellow soybeans');
  });

  it('refuses something it does not take and says what it does', () => {
    try {
      getCommodity('canola');
    } catch (err) {
      expect(err.code).toBe('NO_SUCH_COMMODITY');
      expect(err.details.known).toContain('corn');
    }
  });

  it('will not let an entry be edited underneath the callers', () => {
    const corn = getCommodity('corn');
    expect(Object.isFrozen(corn)).toBe(true);
    expect(() => {
      'use strict';
      corn.legalWeight = 50;
    }).toThrow();
  });

  it('validates an id for a command line', () => {
    expect(assertCommodityId('HRW')).toBe('hrw');
    expect(() => assertCommodityId('rye')).toThrow(/must be one of/);
  });
});

describe('the numbers on each entry', () => {
  it('holds the legal weight per bushel', () => {
    expect(legalWeight('corn')).toBe(56);
    expect(legalWeight('sorghum')).toBe(56);
    expect(legalWeight('soybeans')).toBe(60);
    expect(legalWeight('hrw')).toBe(60);
  });

  it('holds the moisture the schedule starts at', () => {
    expect(marketMoisture('corn')).toBe(15);
    expect(marketMoisture('soybeans')).toBe(13);
    expect(marketMoisture('hrw')).toBe(13.5);
  });

  it('rolls wheat in June and everything else in September', () => {
    expect(cropYearStartMonth('hrw')).toBe(6);
    expect(cropYearStartMonth('srw')).toBe(6);
    expect(cropYearStartMonth('corn')).toBe(9);
    expect(isWheat('hrw')).toBe(true);
    expect(isWheat('corn')).toBe(false);
  });
});

describe('hedging and storage', () => {
  it('sends milo to the corn board', () => {
    expect(hasOwnFutures('sorghum')).toBe(false);
    expect(hedgeSymbol('sorghum')).toBe('ZC');
    expect(hasOwnFutures('corn')).toBe(true);
    expect(hedgeSymbol('hrw')).toBe('KE');
  });

  it('says whether a load will keep', () => {
    expect(willStore('corn', 14)).toBe(true);
    expect(willStore('corn', 14.1)).toBe(false);
    expect(willStore('soybeans', 12)).toBe(true);
  });

  it('measures the points over the market moisture', () => {
    expect(moisturePointsOver('corn', 17.4)).toBe(2.4);
    expect(moisturePointsOver('corn', 14.2)).toBe(-0.8);
    expect(moisturePointsOver('hrw', 13.5)).toBe(0);
  });
});
