/**
 * Worker Rate Limiting Tests
 * Tests the checkRateLimit function logic from worker/src/index.ts
 */

import { describe, it, expect, beforeEach } from 'vitest';

interface RateLimitConfig {
  windowMs: number;
  max: number;
}

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

// Simulate the rate limit store and functions from worker
const rateLimitStore = new Map<string, RateLimitEntry>();
let requestCount = 0;

const RATE_LIMIT_CLEANUP_INTERVAL = 100;
const RATE_LIMIT_CLEANUP_WINDOW = 60_000;

function checkRateLimit(key: string, limit: RateLimitConfig): boolean {
  const now = Date.now();
  const entry = rateLimitStore.get(key);

  if (!entry || now > entry.resetAt) {
    rateLimitStore.set(key, { count: 1, resetAt: now + limit.windowMs });
    return true;
  }

  if (entry.count >= limit.max) {
    return false;
  }

  entry.count++;
  return true;
}

function cleanupExpiredRateLimitEntries(): void {
  const now = Date.now();
  let cleaned = 0;

  for (const [key, entry] of rateLimitStore) {
    if (now > entry.resetAt && now > entry.resetAt + RATE_LIMIT_CLEANUP_WINDOW) {
      rateLimitStore.delete(key);
      cleaned++;
    }
  }
}

function maybeCleanupRateLimit(): void {
  requestCount++;
  if (requestCount % RATE_LIMIT_CLEANUP_INTERVAL === 0) {
    cleanupExpiredRateLimitEntries();
  }
}

describe('Rate Limit Logic', () => {
  beforeEach(() => {
    rateLimitStore.clear();
    requestCount = 0;
  });

  describe('checkRateLimit', () => {
    it('allows first request within window', () => {
      const limit: RateLimitConfig = { windowMs: 1000, max: 2 };
      expect(checkRateLimit('test-key', limit)).toBe(true);
    });

    it('allows second request within window', () => {
      const limit: RateLimitConfig = { windowMs: 1000, max: 2 };
      checkRateLimit('test-key', limit);
      expect(checkRateLimit('test-key', limit)).toBe(true);
    });

    it('blocks third request when max is 2', () => {
      const limit: RateLimitConfig = { windowMs: 1000, max: 2 };
      checkRateLimit('test-key', limit);
      checkRateLimit('test-key', limit);
      expect(checkRateLimit('test-key', limit)).toBe(false);
    });

    it('allows new key to bypass existing limit', () => {
      const limit: RateLimitConfig = { windowMs: 1000, max: 2 };
      checkRateLimit('key1', limit);
      checkRateLimit('key1', limit);
      // key1 should be blocked
      expect(checkRateLimit('key1', limit)).toBe(false);
      // key2 should be allowed
      expect(checkRateLimit('key2', limit)).toBe(true);
    });

    it('resets after window expires', () => {
      const limit: RateLimitConfig = { windowMs: 100, max: 1 };
      expect(checkRateLimit('test-key', limit)).toBe(true);
      expect(checkRateLimit('test-key', limit)).toBe(false);

      // Advance time past the window by directly modifying the resetAt
      const entry = rateLimitStore.get('test-key');
      expect(entry).toBeDefined();
      entry!.resetAt = Date.now() - 1; // Set to past

      // Now should allow again
      expect(checkRateLimit('test-key', limit)).toBe(true);
    });

    it('uses different limits for different endpoints', () => {
      const getLimit: RateLimitConfig = { windowMs: 1000, max: 2 };
      const saveLimit: RateLimitConfig = { windowMs: 60_000, max: 1 };

      // GET endpoint - 2 requests allowed
      expect(checkRateLimit('get:ip', getLimit)).toBe(true);
      expect(checkRateLimit('get:ip', getLimit)).toBe(true);
      expect(checkRateLimit('get:ip', getLimit)).toBe(false);

      // POST endpoint - different counter, 1 request allowed
      expect(checkRateLimit('save:ip', saveLimit)).toBe(true);
      expect(checkRateLimit('save:ip', saveLimit)).toBe(false);
    });
  });

  describe('maybeCleanupRateLimit', () => {
    it('increments request count', () => {
      expect(requestCount).toBe(0);
      maybeCleanupRateLimit();
      expect(requestCount).toBe(1);
    });

    it('triggers cleanup at interval', () => {
      // Add some expired entries - set resetAt far in the past
      // The cleanup checks: now > resetAt && now > resetAt + RATE_LIMIT_CLEANUP_WINDOW
      // So we need resetAt to be older than now - RATE_LIMIT_CLEANUP_WINDOW
      const now = Date.now();
      rateLimitStore.set('expired-key', { count: 1, resetAt: now - 120_000 }); // Past cleanup window

      requestCount = RATE_LIMIT_CLEANUP_INTERVAL - 2; // 98, after ++ becomes 99 (not divisible by 100)
      maybeCleanupRateLimit();
      expect(rateLimitStore.has('expired-key')).toBe(true); // Not yet cleaned (99 % 100 !== 0)

      requestCount = RATE_LIMIT_CLEANUP_INTERVAL - 1; // 99, after ++ becomes 100 (divisible by 100)
      maybeCleanupRateLimit();
      // Cleanup should have run
      expect(rateLimitStore.has('expired-key')).toBe(false);
    });
  });

  describe('Rate Limit Configuration', () => {
    it('getCache allows 2 requests per second', () => {
      const limit: RateLimitConfig = { windowMs: 1000, max: 2 };
      expect(checkRateLimit('get:10.0.0.1', limit)).toBe(true);
      expect(checkRateLimit('get:10.0.0.1', limit)).toBe(true);
      expect(checkRateLimit('get:10.0.0.1', limit)).toBe(false);
    });

    it('saveCache allows 1 request per minute', () => {
      const limit: RateLimitConfig = { windowMs: 60_000, max: 1 };
      expect(checkRateLimit('save:10.0.0.1', limit)).toBe(true);
      expect(checkRateLimit('save:10.0.0.1', limit)).toBe(false);
    });
  });
});