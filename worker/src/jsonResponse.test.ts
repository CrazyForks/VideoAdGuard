/**
 * Worker JSON Response Tests
 * Tests the jsonResponse and errorResponse functions from worker/src/index.ts
 */

import { describe, it, expect } from 'vitest';

function jsonResponse(
  data: unknown,
  status = 200,
  extraHeaders?: Record<string, string>
): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, X-Client-Version',
      ...extraHeaders,
    },
  });
}

function errorResponse(message: string, status = 400): Response {
  return jsonResponse({ success: false, error: message }, status);
}

describe('JSON Response Building', () => {
  describe('jsonResponse', () => {
    it('returns Response with default status 200', () => {
      const response = jsonResponse({ data: 'test' });
      expect(response.status).toBe(200);
    });

    it('returns Response with custom status', () => {
      const response = jsonResponse({ data: 'test' }, 201);
      expect(response.status).toBe(201);
    });

    it('includes Content-Type application/json header', () => {
      const response = jsonResponse({ data: 'test' });
      expect(response.headers.get('Content-Type')).toBe('application/json');
    });

    it('includes CORS headers', () => {
      const response = jsonResponse({ data: 'test' });
      expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
      expect(response.headers.get('Access-Control-Allow-Methods')).toBe('GET, POST, OPTIONS');
      expect(response.headers.get('Access-Control-Allow-Headers')).toBe('Content-Type, X-Client-Version');
    });

    it('merges extra headers', () => {
      const response = jsonResponse({ data: 'test' }, 200, { 'X-Custom': 'value' });
      expect(response.headers.get('X-Custom')).toBe('value');
    });

    it('serializes object data to JSON string', async () => {
      const data = { success: true, data: { bvid: 'BV1rr4y1S7uC' } };
      const response = jsonResponse(data);
      const body = await response.json();
      expect(body).toEqual(data);
    });

    it('handles null data', async () => {
      const response = jsonResponse(null);
      const body = await response.json();
      expect(body).toBe(null);
    });

    it('handles array data', async () => {
      const data = [1, 2, 3];
      const response = jsonResponse(data);
      const body = await response.json();
      expect(body).toEqual([1, 2, 3]);
    });

    it('handles empty object', async () => {
      const response = jsonResponse({});
      const body = await response.json();
      expect(body).toEqual({});
    });

    it('handles nested objects', async () => {
      const data = { nested: { deeply: { value: 123 } } };
      const response = jsonResponse(data);
      const body = await response.json();
      expect(body).toEqual(data);
    });
  });

  describe('errorResponse', () => {
    it('returns Response with status 400 by default', () => {
      const response = errorResponse('Bad Request');
      expect(response.status).toBe(400);
    });

    it('returns Response with custom error status', () => {
      const response = errorResponse('Not Found', 404);
      expect(response.status).toBe(404);
    });

    it('returns Response with 500 for server errors', () => {
      const response = errorResponse('Internal Error', 500);
      expect(response.status).toBe(500);
    });

    it('returns Response with 429 for rate limit', () => {
      const response = errorResponse('Too Many Requests', 429);
      expect(response.status).toBe(429);
    });

    it('includes error message in body', async () => {
      const response = errorResponse('Invalid BVID');
      const body = await response.json();
      expect(body).toEqual({ success: false, error: 'Invalid BVID' });
    });

    it('formats error as JSON with success: false', async () => {
      const response = errorResponse('Test error');
      const body = await response.json();
      expect(body.success).toBe(false);
      expect(typeof body.error).toBe('string');
    });

    it('preserves error message exactly', async () => {
      const message = 'Specific error message';
      const response = errorResponse(message);
      const body = await response.json();
      expect(body.error).toBe(message);
    });
  });

  describe('Response JSON Parsing', () => {
    it('parses successful cache response correctly', async () => {
      const cacheData = {
        bvid: 'BV1rr4y1S7uC',
        exist: true,
        goodName: ['广告名称'],
        adTimeRanges: [[0, 30]],
        model: 'gpt-4o',
        provider: 'openai',
        detectedAt: Date.now(),
        isDetectionConfident: true,
        accuracy: 'accurate' as const,
        source: 'ai' as const,
        version: 1,
        clientVersion: '1.4.0',
      };

      const response = jsonResponse({
        success: true,
        data: cacheData,
        exists: true,
      });

      const body = await response.json();
      expect(body.success).toBe(true);
      expect(body.exists).toBe(true);
      expect(body.data.bvid).toBe('BV1rr4y1S7uC');
      expect(body.data.accuracy).toBe('accurate');
    });

    it('parses empty cache response correctly', async () => {
      const response = jsonResponse({
        success: true,
        data: null,
        exists: false,
      });

      const body = await response.json();
      expect(body.success).toBe(true);
      expect(body.data).toBe(null);
      expect(body.exists).toBe(false);
    });

    it('parses error response correctly', async () => {
      const response = errorResponse('数据格式非法或字段超限', 400);
      const body = await response.json();

      expect(body.success).toBe(false);
      expect(body.error).toBe('数据格式非法或字段超限');
      expect(response.status).toBe(400);
    });

    it('handles large number of ad ranges in response', async () => {
      const largeRanges = Array.from({ length: 50 }, (_, i) => [i * 60, (i + 1) * 60]);
      const response = jsonResponse({
        success: true,
        data: { adTimeRanges: largeRanges },
      });

      const body = await response.json();
      expect(body.data.adTimeRanges).toHaveLength(50);
    });
  });
});