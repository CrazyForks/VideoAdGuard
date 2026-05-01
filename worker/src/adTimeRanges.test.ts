/**
 * Worker Ad Time Range Validation Tests
 * Tests the validateAdTimeRanges function from worker/src/index.ts
 */

import { describe, it, expect } from 'vitest';

const MAX_AD_RANGES = 50;
const MAX_TIME_VALUE = 86400;

// Copy the validation logic from worker for testing
function validateAdTimeRanges(ranges: unknown): number[][] | null {
  if (!Array.isArray(ranges) || ranges.length > MAX_AD_RANGES) {
    return null;
  }

  for (const range of ranges) {
    if (!Array.isArray(range) || range.length !== 2) {
      return null;
    }
    const [start, end] = range;
    if (!Number.isFinite(start) || !Number.isFinite(end)) {
      return null;
    }
    if (start < 0 || end < 0 || start > MAX_TIME_VALUE || end > MAX_TIME_VALUE) {
      return null;
    }
    if (start >= end) {
      return null;
    }
  }

  return ranges as number[][];
}

describe('Ad Time Range Validation', () => {
  // Valid ranges
  it('returns valid ranges for single valid ad segment', () => {
    const ranges = [[0, 30]];
    expect(validateAdTimeRanges(ranges)).toEqual([[0, 30]]);
  });

  it('returns valid ranges for multiple valid ad segments', () => {
    const ranges = [[0, 30], [60, 90], [120, 150]];
    expect(validateAdTimeRanges(ranges)).toEqual(ranges);
  });

  it('returns valid ranges for boundary values (0 and max)', () => {
    const ranges = [[0, 86400]];
    expect(validateAdTimeRanges(ranges)).toEqual([[0, 86400]]);
  });

  it('returns valid ranges when start is 0', () => {
    const ranges = [[0, 10]];
    expect(validateAdTimeRanges(ranges)).toEqual([[0, 10]]);
  });

  it('returns valid ranges when end equals max time value', () => {
    const ranges = [[100, 86400]];
    expect(validateAdTimeRanges(ranges)).toEqual([[100, 86400]]);
  });

  // Invalid ranges - structure issues
  it('returns null for non-array input', () => {
    expect(validateAdTimeRanges(null)).toBe(null);
    expect(validateAdTimeRanges(undefined)).toBe(null);
    expect(validateAdTimeRanges('string')).toBe(null);
    expect(validateAdTimeRanges(123)).toBe(null);
    expect(validateAdTimeRanges({})).toBe(null);
  });

  it('returns empty array for empty input', () => {
    expect(validateAdTimeRanges([])).toEqual([]);
  });

  it('returns null when range is not an array', () => {
    expect(validateAdTimeRanges([[0]])).toBe(null);
    expect(validateAdTimeRanges([[0, 30, 60]])).toBe(null);
    expect(validateAdTimeRanges([['a', 'b']])).toBe(null);
  });

  it('returns null when range has wrong number of elements', () => {
    expect(validateAdTimeRanges([[0]])).toBe(null);
    expect(validateAdTimeRanges([[0, 30, 60]])).toBe(null);
  });

  it('returns null when range contains non-finite numbers', () => {
    expect(validateAdTimeRanges([[NaN, 30]])).toBe(null);
    expect(validateAdTimeRanges([[0, NaN]])).toBe(null);
    expect(validateAdTimeRanges([[Infinity, 30]])).toBe(null);
    expect(validateAdTimeRanges([[0, -Infinity]])).toBe(null);
  });

  // Invalid ranges - value issues
  it('returns null for negative start time', () => {
    expect(validateAdTimeRanges([[-1, 30]])).toBe(null);
  });

  it('returns null for negative end time', () => {
    expect(validateAdTimeRanges([[0, -30]])).toBe(null);
  });

  it('returns null when start exceeds max time value', () => {
    expect(validateAdTimeRanges([[86401, 90000]])).toBe(null);
  });

  it('returns null when end exceeds max time value', () => {
    expect(validateAdTimeRanges([[0, 86401]])).toBe(null);
  });

  it('returns null when start equals end', () => {
    expect(validateAdTimeRanges([[30, 30]])).toBe(null);
  });

  it('returns null when start is greater than end', () => {
    expect(validateAdTimeRanges([[30, 0]])).toBe(null);
  });

  it('returns null when start is slightly greater than end', () => {
    expect(validateAdTimeRanges([[30.1, 30]])).toBe(null);
  });

  // Edge cases - floating point
  it('returns valid ranges for float values within bounds', () => {
    const ranges = [[0.5, 30.5]];
    expect(validateAdTimeRanges(ranges)).toEqual([[0.5, 30.5]]);
  });

  it('returns valid ranges for valid numeric values', () => {
    const ranges = [[0, 30], [60, 90]];
    expect(validateAdTimeRanges(ranges)).toEqual(ranges);
  });

  it('returns null for Infinity values', () => {
    expect(validateAdTimeRanges([[Infinity, 30]])).toBe(null);
    expect(validateAdTimeRanges([[0, Infinity]])).toBe(null);
  });

  // Edge cases - validation behavior with unusual numbers
  it('returns valid ranges for very small floats that round to 0 or positive', () => {
    const ranges = [[0.0001, 0.0002]];
    expect(validateAdTimeRanges(ranges)).toEqual([[0.0001, 0.0002]]);
  });

  // Maximum ranges limit
  it('returns null when exceeding maximum number of ranges', () => {
    const ranges = Array.from({ length: 51 }, (_, i) => [i * 60, (i + 1) * 60]);
    expect(validateAdTimeRanges(ranges)).toBe(null);
  });

  it('returns valid ranges at maximum limit (50 ranges)', () => {
    const ranges = Array.from({ length: 50 }, (_, i) => [i * 60, (i + 1) * 60]);
    expect(validateAdTimeRanges(ranges)).toHaveLength(50);
  });

  // Mixed valid and invalid
  it('returns null if any range in the array is invalid', () => {
    const ranges = [[0, 30], [-1, 40], [60, 90]];
    expect(validateAdTimeRanges(ranges)).toBe(null);
  });
});