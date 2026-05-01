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

// Rate limit 配置
const RATE_LIMITS = {
  getCache: { windowMs: 1000, max: 20 },    // GET /api/cache/:bvid
  saveCache: { windowMs: 60_000, max: 10 }, // POST /api/cache
};

// 内存 rate limit 存储（Worker 实例级别）
const rateLimitStore = new Map<string, { count: number; resetAt: number }>();

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

function makeKey(bvid: string): string {
  return bvid;
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

      let body: Record<string, unknown>;
      try {
        body = await request.json() as Record<string, unknown>;
      } catch {
        return errorResponse('请求体必须是 JSON', 400);
      }

      const bvid = body.bvid as string;
      if (!isValidBvid(bvid)) {
        return errorResponse('无效的 BV 号格式', 400);
      }

      const accuracy = body.accuracy as string;
      // accuracy 字段：accurate / inaccurate
      // inaccurate 表示用户标记为不准确，查询时会跳过
      const finalAccuracy = accuracy === 'inaccurate' ? 'inaccurate' : 'accurate';

      // source 字段：ai / user，直接取 body.source
      const finalSource = body.source === 'user' ? 'user' : 'ai';

      // 用户反馈修正时（source: 'user'），仅更新 source 和 accuracy，保留云端原有数据
      if (finalSource === 'user') {
        const existingValue = await env.VIDEO_AD_GUARD_KV.get(makeKey(bvid));
        if (existingValue) {
          try {
            const existingRecord = JSON.parse(existingValue);
            const updatedRecord = {
              ...existingRecord,
              accuracy: finalAccuracy,
              source: finalSource,
            };
            await env.VIDEO_AD_GUARD_KV.put(makeKey(bvid), JSON.stringify(updatedRecord), getKvOptions(CACHE_TTL_SECONDS));
            return jsonResponse({ success: true, data: { bvid, accuracy: finalAccuracy } });
          } catch {
            // 解析失败，继续使用 body 数据覆盖
          }
        }
      }

      const record = {
        bvid,
        exist: Boolean(body.exist),
        goodName: Array.isArray(body.goodName) ? body.goodName : [],
        adTimeRanges: Array.isArray(body.adTimeRanges) ? body.adTimeRanges : [],
        model: String(body.model || 'unknown'),
        provider: String(body.provider || 'unknown'),
        detectedAt: Number(body.detectedAt) || Date.now(),
        isDetectionConfident: Boolean(body.isDetectionConfident),
        accuracy: finalAccuracy,
        source: finalSource,
        version: DATA_VERSION,
        clientVersion: String(body.clientVersion || ''),
      };

      await env.VIDEO_AD_GUARD_KV.put(makeKey(bvid), JSON.stringify(record), getKvOptions(CACHE_TTL_SECONDS));

      return jsonResponse({ success: true, data: { bvid, accuracy: record.accuracy } });
    }

    return errorResponse('未找到接口', 404);
  },
};