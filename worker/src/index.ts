/**
 * VideoAdGuard Cloudflare Worker - 云端广告缓存服务
 *
 * API:
 *   GET  /api/cache/:bvid - 查询广告缓存（仅返回 accurate 记录）
 *   POST /api/cache       - 保存/更新广告缓存
 */

export interface Env {
  VIDEO_AD_GUARD_KV: KVNamespace;
}

// 数据格式版本
const DATA_VERSION = 1;

// KV TTL (秒) - 0 表示永不过期，Cloudflare KV 要求 > 0
const CACHE_TTL_SECONDS = 0;

// 获取 KV put 选项
function getKvOptions(ttl: number): { expirationTtl: number } | undefined {
  return ttl > 0 ? { expirationTtl: ttl } : undefined;
}

// 数据验证常量
const MAX_BODY_SIZE = 10 * 1024; // 请求体最大 10KB
const MAX_AD_RANGES = 50;        // 广告区间最多 50 段
const MAX_GOOD_NAMES = 100;       // 商品名称最多 100 个
const MAX_TIME_VALUE = 86400;    // 时间值最大 1 天（秒）
const MAX_STRING_LENGTH = 100;    // 字符串字段最大长度

// Rate limit 配置（严格限制，防止滥用）
const RATE_LIMITS = {
  getCache: { windowMs: 1000, max: 2 },    // GET /api/cache/:bvid（每秒最多2次）
  saveCache: { windowMs: 60_000, max: 1 }, // POST /api/cache（每分钟最多1次）
};

// 内存 rate limit 存储（Worker 实例级别）
const rateLimitStore = new Map<string, { count: number; resetAt: number }>();

// 定期清理过期的 rate limit 条目（每 100 次请求或每分钟清理一次）
let requestCount = 0;
const RATE_LIMIT_CLEANUP_INTERVAL = 100;
const RATE_LIMIT_CLEANUP_WINDOW = 60_000; // 超过这个时间的条目视为过期

function isValidBvid(bvid: string): boolean {
  return typeof bvid === 'string' && /^BV1[0-9A-Za-z]{8,}$/.test(bvid);
}

function checkRateLimit(key: string, limit: { windowMs: number; max: number }): boolean {
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

/**
 * 清理过期的 rate limit 条目，防止内存泄漏
 */
function cleanupExpiredRateLimitEntries(): void {
  const now = Date.now();
  let cleaned = 0;
  for (const [key, entry] of rateLimitStore.entries()) {
    // 删除已过期且超过一个窗口期的条目
    if (now > entry.resetAt && now > entry.resetAt + RATE_LIMIT_CLEANUP_WINDOW) {
      rateLimitStore.delete(key);
      cleaned++;
    }
  }
  if (cleaned > 0) {
    console.log(`[RateLimit] 清理了 ${cleaned} 个过期条目，剩余 ${rateLimitStore.size}`);
  }
}

/**
 * 可能时清理 rate limit 存储
 */
function maybeCleanupRateLimit(): void {
  requestCount++;
  if (requestCount % RATE_LIMIT_CLEANUP_INTERVAL === 0) {
    cleanupExpiredRateLimitEntries();
  }
}

function makeKey(bvid: string): string {
  return bvid;
}

/**
 * 验证时间范围数组
 */
function validateAdTimeRanges(ranges: unknown): number[][] | null {
  if (!Array.isArray(ranges)) return null;
  if (ranges.length > MAX_AD_RANGES) return null;

  for (const range of ranges) {
    if (!Array.isArray(range) || range.length !== 2) return null;
    const [start, end] = range;
    if (typeof start !== 'number' || typeof end !== 'number') return null;
    if (start < 0 || end < 0 || start > MAX_TIME_VALUE || end > MAX_TIME_VALUE) return null;
    if (start >= end) return null; // 开始时间必须小于结束时间
  }
  return ranges as number[][];
}

/**
 * 验证商品名称数组
 */
function validateGoodNames(names: unknown): string[] | null {
  if (!Array.isArray(names)) return null;
  if (names.length > MAX_GOOD_NAMES) return null;

  for (const name of names) {
    if (typeof name !== 'string') return null;
    if (name.length > MAX_STRING_LENGTH) return null;
  }
  return names as string[];
}

/**
 * 验证并清理保存请求的数据
 */
function validateSaveBody(body: Record<string, unknown>): {
  bvid: string;
  exist: boolean;
  goodName: string[];
  adTimeRanges: number[][];
  model: string;
  provider: string;
  detectedAt: number;
  isDetectionConfident: boolean;
  accuracy: string;
  source: string;
  clientVersion: string;
} | null {
  // 验证 bvid
  const bvid = typeof body.bvid === 'string' ? body.bvid : '';
  if (!isValidBvid(bvid)) return null;

  // 验证 exist
  const exist = body.exist === true;

  // 验证 goodName
  const goodName = validateGoodNames(body.goodName);
  if (goodName === null) return null;

  // 验证 adTimeRanges
  const adTimeRanges = validateAdTimeRanges(body.adTimeRanges);
  if (adTimeRanges === null) return null;

  // 验证 model / provider（字符串，最大长度限制）
  const model = typeof body.model === 'string' ? body.model.slice(0, MAX_STRING_LENGTH) : 'unknown';
  const provider = typeof body.provider === 'string' ? body.provider.slice(0, MAX_STRING_LENGTH) : 'unknown';

  // 验证 detectedAt
  const detectedAt = typeof body.detectedAt === 'number' ? body.detectedAt : Date.now();
  if (detectedAt < 0 || detectedAt > Date.now() + 86400000) return null; // 不允许未来时间

  // 验证 isDetectionConfident
  const isDetectionConfident = body.isDetectionConfident === true;

  // 验证 accuracy
  const accuracy = body.accuracy === 'inaccurate' ? 'inaccurate' : 'accurate';

  // 验证 source
  const source = body.source === 'user' ? 'user' : 'ai';

  // 验证 clientVersion
  const clientVersion = typeof body.clientVersion === 'string' ? body.clientVersion.slice(0, MAX_STRING_LENGTH) : '';

  return { bvid, exist, goodName, adTimeRanges, model, provider, detectedAt, isDetectionConfident, accuracy, source, clientVersion };
}

function jsonResponse(data: unknown, status = 200, headers?: Record<string, string>): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, X-Client-Version',
      ...headers,
    },
  });
}

function errorResponse(message: string, status = 400): Response {
  return jsonResponse({ success: false, error: message }, status);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // 定期清理过期的 rate limit 条目
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
    const clientIP = request.headers.get('CF-Connecting-IP') || 'unknown';

    // GET /api/cache/:bvid
    const cacheMatch = url.pathname.match(/^\/api\/cache\/(.+)$/);
    if (request.method === 'GET' && cacheMatch) {
      const bvid = cacheMatch[1];

      if (!isValidBvid(bvid)) {
        return errorResponse('无效的 BV 号格式', 400);
      }

      const rateKey = `get:${clientIP}`;
      if (!checkRateLimit(rateKey, RATE_LIMITS.getCache)) {
        return errorResponse('请求过于频繁', 429);
      }

      const value = await env.VIDEO_AD_GUARD_KV.get(makeKey(bvid));

      // 未找到缓存
      if (!value) {
        return jsonResponse({ success: true, data: null, exists: false });
      }

      try {
        const record = JSON.parse(value);
        // 仅 accurate 记录才视为有效缓存
        if (record.accuracy === 'accurate') {
          return jsonResponse({ success: true, data: record, exists: true });
        }
        // 存在记录但 accuracy !== 'accurate'，视为无有效缓存
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

      // 检查请求体大小
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

      // 验证并清理数据
      const validated = validateSaveBody(body);
      if (!validated) {
        return errorResponse('数据格式非法或字段超限', 400);
      }

      // 用户反馈修正时（source: 'user'），仅更新 source 和 accuracy，保留云端原有数据
      if (validated.source === 'user') {
        const existingValue = await env.VIDEO_AD_GUARD_KV.get(makeKey(validated.bvid));
        if (existingValue) {
          try {
            const existingRecord = JSON.parse(existingValue);
            const updatedRecord = {
              ...existingRecord,
              accuracy: validated.accuracy,
              source: validated.source,
            };
            await env.VIDEO_AD_GUARD_KV.put(makeKey(validated.bvid), JSON.stringify(updatedRecord), getKvOptions(CACHE_TTL_SECONDS));
            return jsonResponse({ success: true, data: { bvid: validated.bvid, accuracy: validated.accuracy } });
          } catch {
            // 解析失败，继续使用验证后的数据覆盖
          }
        }
      }

      const record = {
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
        clientVersion: String(body.clientVersion || ''),
      };

      await env.VIDEO_AD_GUARD_KV.put(makeKey(validated.bvid), JSON.stringify(record), getKvOptions(CACHE_TTL_SECONDS));

      return jsonResponse({ success: true, data: { bvid: validated.bvid, accuracy: record.accuracy } });
    }

    return errorResponse('未找到接口', 404);
  },
};