import { describe, expect, it } from 'vitest';
import { unitSearches } from './unit-searches.js';

const rows = [
  { query: 'cho thuê căn hộ monarchy', impressions: 50 },
  { query: 'monarchy đà nẵng', impressions: 120 },
  { query: 'bán căn hộ monarchy', impressions: 300 },
  { query: 'thuê căn hộ 2pn đà nẵng', impressions: 40 },
  { query: 'căn hộ sun ponte đà nẵng', impressions: 500 },
  { query: 'văn phòng cho thuê đà nẵng', impressions: 90 },
  { query: 'đất vàng group', impressions: 900 },
];

describe('unitSearches', () => {
  it('puts searches naming the project first, then general ones for the kind', () => {
    expect(unitSearches(rows, { project: 'The Monarchy', listing: 'rent', otherProjects: ['Sun Ponte Residence'] })).toEqual([
      'monarchy đà nẵng',
      'cho thuê căn hộ monarchy',
      'thuê căn hộ 2pn đà nẵng',
    ]);
  });
  it('keeps buying searches for a unit for sale only', () => {
    expect(unitSearches(rows, { project: 'The Monarchy', listing: 'sale', otherProjects: [] })).toEqual([
      'bán căn hộ monarchy',
      'monarchy đà nẵng',
      'căn hộ sun ponte đà nẵng',
    ]);
  });
  it('an office looks for office searches', () => {
    expect(unitSearches(rows, { kind: 'office', listing: 'rent' })).toEqual(['văn phòng cho thuê đà nẵng']);
  });
});
