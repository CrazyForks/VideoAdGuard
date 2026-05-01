/**
 * parseAdResult Function Tests
 * Tests the parseAdResult function from src/content.ts
 */

import { describe, it, expect } from 'vitest';

// Extracted parseAdResult function for testing
interface AdDetectionJSON {
  exist: boolean;
  good_name: string[];
  index_lists: number[][];
}

function parseAdResult(raw: string, captionsLength = 0): AdDetectionJSON {
  const EMPTY: AdDetectionJSON = { exist: false, good_name: [], index_lists: [] };
  if (!raw || typeof raw !== "string") return EMPTY;

  // Remove code block wrapping + capture max curly brace block
  let s = raw.trim()
    .replace(/```[\s\S]*?```/g, (m) => m.replace(/```/g, ""))
    .replace(/^[\s\S]*?({[\s\S]*})[\s\S]*$/m, "$1")
    .replace(/[“”„‟″]/g, '"') // Chinese/curly quotes -> "
    .replace(/[‘’′]/g, "'");

  let obj: any = null;
  try {
    obj = JSON.parse(s);
  } catch {
    const match = raw.match(/{[\s\S]*}/);
    if (match) {
      const cand = match[0]
        .replace(/[“”„‟″]/g, '"')
        .replace(/[‘’′]/g, "'");
      try { obj = JSON.parse(cand); } catch { obj = null; }
    }
  }
  if (!obj || typeof obj !== "object") return EMPTY;

  const out: AdDetectionJSON = {
    exist: typeof obj.exist === "boolean" ? obj.exist : false,
    good_name: Array.isArray(obj.good_name) ? (obj.good_name as unknown[]).filter((x: unknown) => typeof x === "string") as string[] : [],
    index_lists: Array.isArray(obj.index_lists) ? obj.index_lists : []
  };

  // Index cleaning: 2D integer ranges, boundary correction, sort and merge
  const N = Math.max(0, captionsLength | 0);
  const cleaned: number[][] = [];
  for (const seg of out.index_lists) {
    if (!Array.isArray(seg) || seg.length !== 2) continue;
    let [a, b] = seg;
    if (typeof a !== "number" || typeof b !== "number") continue;
    a = Math.max(0, Math.floor(a));
    b = Math.max(0, Math.floor(b));
    if (N > 0) { a = Math.min(a, N - 1); b = Math.min(b, N - 1); }
    if (a > b) [a, b] = [b, a];
    cleaned.push([a, b]);
  }
  cleaned.sort((x, y) => x[0] - y[0] || x[1] - y[1]);
  const merged: number[][] = [];
  for (const seg of cleaned) {
    if (!merged.length || seg[0] > merged[merged.length - 1][1] + 1) {
      merged.push([seg[0], seg[1]]);
    } else {
      merged[merged.length - 1][1] = Math.max(merged[merged.length - 1][1], seg[1]);
    }
  }
  out.index_lists = merged;

  // No valid segments force exist=false
  if (!out.index_lists.length && out.exist === true) {
    out.exist = false;
  }
  return out;
}

describe('parseAdResult', () => {
  describe('Basic Parsing', () => {
    it('parses valid JSON with all fields', () => {
      const input = '{"exist": true, "good_name": ["广告1", "广告2"], "index_lists": [[0, 10], [20, 30]]}';
      const result = parseAdResult(input);
      expect(result.exist).toBe(true);
      expect(result.good_name).toEqual(['广告1', '广告2']);
      expect(result.index_lists).toEqual([[0, 10], [20, 30]]);
    });

    it('parses JSON with only exist field', () => {
      const input = '{"exist": false}';
      const result = parseAdResult(input);
      expect(result.exist).toBe(false);
      expect(result.good_name).toEqual([]);
      expect(result.index_lists).toEqual([]);
    });

    it('parses empty object', () => {
      const input = '{}';
      const result = parseAdResult(input);
      expect(result.exist).toBe(false);
      expect(result.good_name).toEqual([]);
      expect(result.index_lists).toEqual([]);
    });

    it('sets exist=false when index_lists is empty (even if exist was true)', () => {
      // This is correct behavior - when exist=true but index_lists is empty,
      // the function resets exist to false
      const input = '{"exist": true, "good_name": [], "index_lists": []}';
      const result = parseAdResult(input);
      expect(result.exist).toBe(false); // Empty index_lists forces exist=false
    });
  });

  describe('Good JSON Input', () => {
    it('parses clean JSON without surrounding text', () => {
      const input = '{"exist": true, "good_name": ["广告"], "index_lists": [[0, 10]]}';
      const result = parseAdResult(input);
      expect(result.exist).toBe(true);
      expect(result.good_name).toEqual(['广告']);
      expect(result.index_lists).toEqual([[0, 10]]);
    });
  });

  describe('Quote Character Handling', () => {
    it('converts Chinese double quotes to standard quotes', () => {
      const input = '{"exist": true, "good_name": ["广告"], "index_lists": [[0, 10]]}'.replace(/"/g, '"');
      const result = parseAdResult(input);
      expect(result.good_name).toEqual(['广告']);
    });

    it('handles curly quotes in good_name values', () => {
      // Use actual curly quote characters (U+201C U+201D) to test replacement
      const input = '{"exist": true, "good_name": [“广告”], "index_lists": [[0, 10]]}';
      const result = parseAdResult(input);
      expect(result.good_name).toEqual(['广告']);
    });
  });

  describe('Index List Cleaning', () => {
    it('clamps indices to captionsLength boundary', () => {
      const input = '{"exist": true, "good_name": [], "index_lists": [[0, 100]]}';
      const result = parseAdResult(input, 50); // Only 50 captions
      expect(result.index_lists[0][1]).toBe(49); // Clamped to max index
    });

    it('swaps reversed ranges', () => {
      const input = '{"exist": true, "good_name": [], "index_lists": [[30, 10]]}';
      const result = parseAdResult(input);
      expect(result.index_lists[0]).toEqual([10, 30]);
    });

    it('removes negative indices', () => {
      const input = '{"exist": true, "good_name": [], "index_lists": [[-5, 10]]}';
      const result = parseAdResult(input);
      expect(result.index_lists[0][0]).toBe(0);
    });

    it('merges overlapping ranges', () => {
      const input = '{"exist": true, "good_name": [], "index_lists": [[0, 10], [8, 20]]}';
      const result = parseAdResult(input);
      expect(result.index_lists).toEqual([[0, 20]]);
    });

    it('merges adjacent ranges (within 1 gap)', () => {
      const input = '{"exist": true, "good_name": [], "index_lists": [[0, 10], [11, 20]]}';
      const result = parseAdResult(input);
      expect(result.index_lists).toEqual([[0, 20]]);
    });

    it('sorts non-overlapping ranges by start time', () => {
      const input = '{"exist": true, "good_name": [], "index_lists": [[30, 40], [0, 10], [50, 60]]}';
      const result = parseAdResult(input);
      expect(result.index_lists[0]).toEqual([0, 10]);
      expect(result.index_lists[1]).toEqual([30, 40]);
      expect(result.index_lists[2]).toEqual([50, 60]);
    });

    it('filters out non-array index entries', () => {
      const input = '{"exist": true, "good_name": [], "index_lists": [[0, 10], "invalid", [20, 30]]}';
      const result = parseAdResult(input);
      expect(result.index_lists).toHaveLength(2);
    });

    it('filters out index entries with wrong length', () => {
      const input = '{"exist": true, "good_name": [], "index_lists": [[0, 10, 20], [30, 40]]}';
      const result = parseAdResult(input);
      expect(result.index_lists).toHaveLength(1);
    });

    it('filters out non-numeric index values', () => {
      const input = '{"exist": true, "good_name": [], "index_lists": [["a", "b"], [30, 40]]}';
      const result = parseAdResult(input);
      expect(result.index_lists).toHaveLength(1);
    });

    it('handles empty index_lists', () => {
      const input = '{"exist": true, "good_name": [], "index_lists": []}';
      const result = parseAdResult(input);
      expect(result.index_lists).toEqual([]);
    });

    it('handles missing index_lists', () => {
      const input = '{"exist": true, "good_name": []}';
      const result = parseAdResult(input);
      expect(result.index_lists).toEqual([]);
    });
  });

  describe('exist Flag Logic', () => {
    it('keeps exist=true when index_lists has entries', () => {
      const input = '{"exist": true, "good_name": [], "index_lists": [[0, 10]]}';
      const result = parseAdResult(input);
      expect(result.exist).toBe(true);
    });

    it('sets exist=false when index_lists is empty', () => {
      const input = '{"exist": true, "good_name": [], "index_lists": []}';
      const result = parseAdResult(input);
      expect(result.exist).toBe(false);
    });

    it('keeps exist=false when explicitly set', () => {
      const input = '{"exist": false, "good_name": [], "index_lists": [[0, 10]]}';
      const result = parseAdResult(input);
      expect(result.exist).toBe(false);
    });
  });

  describe('good_name Array Cleaning', () => {
    it('filters to only string entries', () => {
      const input = '{"exist": false, "good_name": ["广告1", 123, "广告2", null, "广告3"], "index_lists": []}';
      const result = parseAdResult(input);
      expect(result.good_name).toEqual(['广告1', '广告2', '广告3']);
    });

    it('handles empty good_name array', () => {
      const input = '{"exist": false, "good_name": [], "index_lists": []}';
      const result = parseAdResult(input);
      expect(result.good_name).toEqual([]);
    });

    it('handles missing good_name', () => {
      const input = '{"exist": false, "index_lists": []}';
      const result = parseAdResult(input);
      expect(result.good_name).toEqual([]);
    });

    it('handles non-array good_name', () => {
      const input = '{"exist": false, "good_name": "not an array", "index_lists": []}';
      const result = parseAdResult(input);
      expect(result.good_name).toEqual([]);
    });
  });

  describe('Edge Cases', () => {
    it('returns empty result for null input', () => {
      const result = parseAdResult(null as any);
      expect(result).toEqual({ exist: false, good_name: [], index_lists: [] });
    });

    it('returns empty result for undefined input', () => {
      const result = parseAdResult(undefined as any);
      expect(result).toEqual({ exist: false, good_name: [], index_lists: [] });
    });

    it('returns empty result for empty string', () => {
      const result = parseAdResult('');
      expect(result).toEqual({ exist: false, good_name: [], index_lists: [] });
    });

    it('returns empty result for non-JSON string', () => {
      const result = parseAdResult('not json at all');
      expect(result.exist).toBe(false);
    });

    it('handles deeply nested JSON', () => {
      const input = '{"exist": true, "good_name": [], "index_lists": [[0, 10]], "nested": {"a": {"b": {"c": 1}}}}';
      const result = parseAdResult(input);
      expect(result.exist).toBe(true);
    });

    it('handles unicode in JSON', () => {
      const input = '{"exist": true, "good_name": ["广告"], "index_lists": [[0, 10]]}';
      const result = parseAdResult(input);
      expect(result.good_name[0]).toBe('广告');
    });
  });

  describe('captionsLength Boundary Correction', () => {
    it('respects captionsLength=0 (no correction)', () => {
      const input = '{"exist": true, "good_name": [], "index_lists": [[0, 1000]]}';
      const result = parseAdResult(input, 0);
      expect(result.index_lists[0][0]).toBe(0);
      expect(result.index_lists[0][1]).toBe(1000);
    });

    it('clamps both start and end to N-1', () => {
      const input = '{"exist": true, "good_name": [], "index_lists": [[5, 100]]}';
      const result = parseAdResult(input, 50);
      expect(result.index_lists[0]).toEqual([5, 49]);
    });

    it('handles captionsLength=1 correctly', () => {
      const input = '{"exist": true, "good_name": [], "index_lists": [[0, 0]]}';
      const result = parseAdResult(input, 1);
      expect(result.index_lists[0]).toEqual([0, 0]);
    });
  });
});