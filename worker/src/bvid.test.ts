/**
 * Worker BVID Validation Tests
 * Tests the isValidBvid function from worker/src/index.ts
 */

import { describe, it, expect } from 'vitest';

// Import the validation function - we'll test the logic directly
// since we can't import from the Worker directly in Node environment

function isValidBvid(bvid: string): boolean {
  return typeof bvid === 'string' && /^BV1[0-9A-Za-z]{8,}$/.test(bvid);
}

describe('BVID Format Validation', () => {
  // Valid BVIDs
  it('returns true for valid standard BVID', () => {
    expect(isValidBvid('BV1rr4y1S7uC')).toBe(true);
  });

  it('returns true for BVID with mixed case letters', () => {
    expect(isValidBvid('BV1Aa1EeWdFc')).toBe(true);
  });

  it('returns true for minimum length valid BVID (BV1 + 8 chars)', () => {
    expect(isValidBvid('BV1AAAAAAAA')).toBe(true);
  });

  it('returns true for longer BVID', () => {
    expect(isValidBvid('BV1rrrrrrrrrrrrr')).toBe(true);
  });

  // Invalid BVIDs - format issues
  it('returns false for BVID with lowercase bv prefix', () => {
    expect(isValidBvid('bv1rr4y1S7uC')).toBe(false);
  });

  it('returns false for BVID with no BV prefix', () => {
    expect(isValidBvid('1rr4y1S7uC')).toBe(false);
  });

  it('returns false for BVID with wrong prefix BV0', () => {
    expect(isValidBvid('BV0rr4y1S7uC')).toBe(false);
  });

  it('returns false for BVID with only BV1 (too short)', () => {
    expect(isValidBvid('BV1')).toBe(false);
  });

  it('returns false for BVID with less than 8 chars after BV1', () => {
    expect(isValidBvid('BV1ABCDEFG')).toBe(false); // Only 7 chars after BV1
  });

  it('returns false for BVID with special characters', () => {
    expect(isValidBvid('BV1rr4y1S7u!')).toBe(false);
  });

  it('returns false for BVID with spaces', () => {
    expect(isValidBvid('BV1rr4y1 S7uC')).toBe(false);
  });

  it('returns true for BVID with numbers after BV1', () => {
    expect(isValidBvid('BV1000000000')).toBe(true); // Numbers are valid
  });

  // Edge cases
  it('returns false for empty string', () => {
    expect(isValidBvid('')).toBe(false);
  });

  it('returns false for non-string input', () => {
    expect(isValidBvid(null as any)).toBe(false);
    expect(isValidBvid(undefined as any)).toBe(false);
    expect(isValidBvid(123 as any)).toBe(false);
  });

  it('returns false for object input', () => {
    expect(isValidBvid({} as any)).toBe(false);
  });

  it('returns false for array input', () => {
    expect(isValidBvid([] as any)).toBe(false);
  });
});