# VideoAdGuard Cloudflare Worker

云端广告缓存服务，为 VideoAdGuard 浏览器扩展提供社区共享的检测结果存储。

## 数据设计

- **存储键**: `{bvid}` (直接使用 BV 号)
- **TTL**: 30 天
- **查询逻辑**: 仅返回 `accuracy: 'accurate'` 的记录；`inaccurate` 记录会被跳过
- **数据来源**: `source: 'ai'` (AI 检测) 或 `source: 'user'` (用户手动修正)

## 部署步骤

1. 安装依赖
   ```bash
   npm install
   ```

2. 创建 KV Namespace
   ```bash
   npx wrangler kv:namespace create "VIDEO_AD_GUARD_KV"
   ```

3. 将返回的 `id` 填入 `wrangler.toml` 中的 `kv_namespaces.id`

4. 部署
   ```bash
   npm run deploy
   ```

5. 将部署后的 Worker URL（如 `https://video-ad-guard.xxx.workers.dev`）填入扩展设置的"云端缓存 Worker URL"中

## API

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/cache/:bvid` | 查询广告缓存（仅返回 accurate 记录） |
| POST | `/api/cache` | 保存/更新广告缓存 |

### GET /api/cache/:bvid 响应

```json
// 命中
{ "success": true, "data": {...}, "exists": true }

// 未命中（无记录 或 accuracy !== 'accurate'）
{ "success": true, "data": null, "exists": false }
```

### POST /api/cache 请求体

```json
{
  "bvid": "BV1xxxxxx",
  "exist": true,
  "goodName": ["商品A", "商品B"],
  "adTimeRanges": [[10.5, 45.2], [120.0, 180.5]],
  "model": "gpt-4o",
  "provider": "openai",
  "detectedAt": 1746057600000,
  "isDetectionConfident": true,
  "accuracy": "accurate",
  "source": "ai",
  "version": 1,
  "clientVersion": "1.3.1"
}
```

**accuracy 字段说明**:
- `accurate`: 正常记录，查询时返回
- `inaccurate`: 用户标记不准确，查询时跳过（保留原数据用于分析）

**source 字段说明**:
- `ai`: AI 检测结果
- `user`: 用户手动修正

## Rate Limiting

- GET: 每 IP 每秒 20 次
- POST: 每 IP 每分钟 10 次

## 安全

- BVID 格式校验：`^BV1[0-9A-Za-z]{8,}$`
- CORS 开放（扩展使用）
- 无鉴权（扩展源码可被提取，安全性依赖 Cloudflare 网络隔离）