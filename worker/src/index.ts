/**
 * VideoAdGuard Cloudflare Worker - 云端广告缓存服务
 *
 * API:
 *   GET  /api/cache/:bvid - 查询广告缓存（仅返回 accurate 记录）
 *   POST /api/cache       - 保存/更新广告缓存
 */

// ============= 类型定义 =============

export interface Env {
  VIDEO_AD_GUARD_KV: KVNamespace;
}

interface AdRecord {
  bvid: string;
  exist: boolean;
  goodName: string[];
  adTimeRanges: number[][];
  model: string;
  provider: string;
  detectedAt: number;
  isDetectionConfident: boolean;
  accuracy: 'accurate' | 'inaccurate';
  source: 'ai' | 'user';
  version: number;
  clientVersion: string;
}

interface ValidatedSaveData {
  bvid: string;
  exist: boolean;
  goodName: string[];
  adTimeRanges: number[][];
  model: string;
  provider: string;
  detectedAt: number;
  isDetectionConfident: boolean;
  accuracy: 'accurate' | 'inaccurate';
  source: 'ai' | 'user';
  clientVersion: string;
}

interface RateLimitConfig {
  windowMs: number;
  max: number;
}

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

// ============= 常量 =============

const DATA_VERSION = 1;
const CACHE_TTL_SECONDS = 0;

const MAX_BODY_SIZE = 10 * 1024;
const MAX_AD_RANGES = 50;
const MAX_GOOD_NAMES = 100;
const MAX_TIME_VALUE = 86400;
const MAX_STRING_LENGTH = 100;
const MAX_FUTURE_MS = 86400000; // 允许的最大未来时间（1天）

const RATE_LIMITS: Record<'getCache' | 'saveCache', RateLimitConfig> = {
  getCache: { windowMs: 1000, max: 2 },
  saveCache: { windowMs: 60_000, max: 1 },
};

const RATE_LIMIT_CLEANUP_INTERVAL = 100;
const RATE_LIMIT_CLEANUP_WINDOW = 60_000;

// ============= 状态 =============

const rateLimitStore = new Map<string, RateLimitEntry>();
let requestCount = 0;

// ============= 工具函数 =============

function getKvOptions(ttl: number): { expirationTtl: number } | undefined {
  return ttl > 0 ? { expirationTtl: ttl } : undefined;
}

function isValidBvid(bvid: string): boolean {
  return typeof bvid === 'string' && /^BV1[0-9A-Za-z]{8,}$/.test(bvid);
}

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

  if (cleaned > 0) {
    console.log(`[RateLimit] 清理了 ${cleaned} 个过期条目，剩余 ${rateLimitStore.size}`);
  }
}

function maybeCleanupRateLimit(): void {
  requestCount++;
  if (requestCount % RATE_LIMIT_CLEANUP_INTERVAL === 0) {
    cleanupExpiredRateLimitEntries();
  }
}

// ============= 数据验证 =============

function validateAdTimeRanges(ranges: unknown): number[][] | null {
  if (!Array.isArray(ranges) || ranges.length > MAX_AD_RANGES) {
    return null;
  }

  for (const range of ranges) {
    if (!Array.isArray(range) || range.length !== 2) {
      return null;
    }
    const [start, end] = range;
    if (typeof start !== 'number' || typeof end !== 'number') {
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

function validateGoodNames(names: unknown): string[] | null {
  if (!Array.isArray(names) || names.length > MAX_GOOD_NAMES) {
    return null;
  }

  for (const name of names) {
    if (typeof name !== 'string' || name.length > MAX_STRING_LENGTH) {
      return null;
    }
  }

  return names as string[];
}

function validateSaveBody(body: Record<string, unknown>): ValidatedSaveData | null {
  const bvid = typeof body.bvid === 'string' ? body.bvid : '';
  if (!isValidBvid(bvid)) {
    return null;
  }

  const goodName = validateGoodNames(body.goodName);
  if (goodName === null) {
    return null;
  }

  const adTimeRanges = validateAdTimeRanges(body.adTimeRanges);
  if (adTimeRanges === null) {
    return null;
  }

  const model = typeof body.model === 'string'
    ? body.model.slice(0, MAX_STRING_LENGTH)
    : 'unknown';
  const provider = typeof body.provider === 'string'
    ? body.provider.slice(0, MAX_STRING_LENGTH)
    : 'unknown';

  const detectedAt = typeof body.detectedAt === 'number' ? body.detectedAt : Date.now();
  if (detectedAt < 0 || detectedAt > Date.now() + MAX_FUTURE_MS) {
    return null;
  }

  const clientVersion = typeof body.clientVersion === 'string'
    ? body.clientVersion.slice(0, MAX_STRING_LENGTH)
    : '';

  return {
    bvid,
    exist: body.exist === true,
    goodName,
    adTimeRanges,
    model,
    provider,
    detectedAt,
    isDetectionConfident: body.isDetectionConfident === true,
    accuracy: body.accuracy === 'inaccurate' ? 'inaccurate' : 'accurate',
    source: body.source === 'user' ? 'user' : 'ai',
    clientVersion,
  };
}

// ============= 响应构建 =============

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

// ============= 请求处理 =============

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    maybeCleanupRateLimit();

    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, X-Client-Version',
        },
      });
    }

    const url = new URL(request.url);
    const clientIP = request.headers.get('CF-Connecting-IP') ?? 'unknown';

    // GET /api/cache/:bvid
    const cacheMatch = url.pathname.match(/^\/api\/cache\/(?<bvid>.+)$/);
    if (request.method === 'GET' && cacheMatch?.groups?.bvid) {
      const bvid = cacheMatch.groups.bvid;

      if (!isValidBvid(bvid)) {
        return errorResponse('无效的 BV 号格式', 400);
      }

      const rateKey = `get:${clientIP}`;
      if (!checkRateLimit(rateKey, RATE_LIMITS.getCache)) {
        return errorResponse('请求过于频繁', 429);
      }

      const value = await env.VIDEO_AD_GUARD_KV.get(bvid);
      if (!value) {
        return jsonResponse({ success: true, data: null, exists: false });
      }

      try {
        const record = JSON.parse(value) as AdRecord;
        if (record.accuracy === 'accurate') {
          return jsonResponse({ success: true, data: record, exists: true });
        }
        return jsonResponse({ success: true, data: null, exists: false });
      } catch {
        return errorResponse('缓存数据格式错误', 500);
      }
    }

    // POST /api/cache
    if (request.method === 'POST' && url.pathname === '/api/cache') {
      const rateKey = `save:${clientIP}`;
      if (!checkRateLimit(rateKey, RATE_LIMITS.saveCache)) {
        return errorResponse('请求过于频繁', 429);
      }

      const contentLength = request.headers.get('content-length');
      if (contentLength && parseInt(contentLength, 10) > MAX_BODY_SIZE) {
        return errorResponse('请求体过大', 400);
      }

      let body: Record<string, unknown>;
      try {
        body = await request.json() as Record<string, unknown>;
      } catch {
        return errorResponse('请求体必须是 JSON', 400);
      }

      const validated = validateSaveBody(body);
      if (!validated) {
        return errorResponse('数据格式非法或字段超限', 400);
      }

      // 用户修正反馈：仅更新 accuracy 和 source，保留其他字段
      if (validated.source === 'user') {
        const existingValue = await env.VIDEO_AD_GUARD_KV.get(validated.bvid);
        if (existingValue) {
          try {
            const existingRecord = JSON.parse(existingValue) as AdRecord;
            const updatedRecord: AdRecord = {
              ...existingRecord,
              accuracy: validated.accuracy,
              source: validated.source,
            };
            await env.VIDEO_AD_GUARD_KV.put(
              validated.bvid,
              JSON.stringify(updatedRecord),
              getKvOptions(CACHE_TTL_SECONDS)
            );
            return jsonResponse({ success: true, data: { bvid: validated.bvid, accuracy: validated.accuracy } });
          } catch {
            // 解析失败，继续使用验证后的数据覆盖
          }
        }
      }

      const record: AdRecord = {
        bvid: validated.bvid,
        exist: validated.exist,
        goodName: validated.goodName,
        adTimeRanges: validated.adTimeRanges,
        model: validated.model,
        provider: validated.provider,
        detectedAt: validated.detectedAt,
        isDetectionConfident: validated.isDetectionConfident,
        accuracy: validated.accuracy,
        source: validated.source,
        version: DATA_VERSION,
        clientVersion: validated.clientVersion,
      };

      await env.VIDEO_AD_GUARD_KV.put(
        validated.bvid,
        JSON.stringify(record),
        getKvOptions(CACHE_TTL_SECONDS)
      );

      return jsonResponse({ success: true, data: { bvid: validated.bvid, accuracy: record.accuracy } });
    }

    return errorResponse('未找到接口', 404);
  },
};