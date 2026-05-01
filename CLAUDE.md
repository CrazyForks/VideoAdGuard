# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build Commands

```bash
npm install          # Install dependencies
npm run build       # Build for both Chrome and Firefox
npm run build:chrome  # Build Chrome extension only
npm run build:firefox # Build Firefox extension only
npm run clean       # Clean build artifacts
```
当你完成一项完整的修改后，运行构建命令，确认构建正确和便于我进行测试

## Architecture

### Browser Extension Structure
The extension uses a multi-script architecture:
- **content.ts**: Main ad detection logic, runs on B站 video pages
- **background.ts**: Handles cross-origin requests (LLM API calls, audio transcription)
- **popup.ts/popup.html**: Settings UI for API configuration

### Ad Detection Flow
1. Content script extracts video BV号 from URL
2. Fetches video metadata, subtitles, and top comments via BilibiliService
3. **并行查询**：本地缓存 → 云端缓存（与 getVideoInfo 并行）+ 视频信息
4. 三条路径统一通过 `applyDetectionResult()` 初始化 UI（跳过按钮、标记层、自动跳过）
5. AI 检测完成后异步上传结果到云端（不阻塞）
6. 用户手动拖拽调整广告区间后，可通过 popup 反馈按钮提交修正到云端

### Multi-Provider LLM Support
LLMGateway in `src/services/llm/providers.ts` routes requests to different providers:
- **openai**: OpenAI-compatible APIs (302.AI, 硅基流动, etc.)
- **anthropic**: Claude API
- **custom_fetch**: Local Ollama and other custom endpoints

Settings are resolved in `src/services/llm/config.ts` by inferring provider from API URL.

### Browser-Specific Audio Implementation
Webpack replaces `./services/audio` with browser-specific implementations:
- `audio.chrome.ts`: Chrome/Edge audio handling
- `audio.firefox.ts`: Firefox audio handling

### Cloud Cache Architecture (Optional Enhancement)
Cloud cache is an optional feature that stores detection results in Cloudflare KV for community sharing.

**Data Model:**
- Key: `ad:{bvid}` (每个视频一个主记录)
- `accuracy: 'accurate'` - 正常记录，查询时返回
- `accuracy: 'inaccurate'` - 用户标记不准确，查询时跳过
- `source: 'ai' | 'user'` - 来源（AI检测或用户手动修正）

**Data Flow:**
- 检测前并行查询云端缓存（Promise.allSettled）
- 查询时 Worker 仅返回 `accuracy === 'accurate'` 的记录
- 命中则跳过 AI 调用，加速用户体验
- AI 检测完成后异步上传（不阻塞正常流程）
- 用户反馈：标记不准确或提交修正，通过 `POST /api/cache` 覆盖记录

**API Endpoints (Worker):**
- `GET /api/cache/:bvid` - 查询缓存（仅返回 accurate 记录）
- `POST /api/cache` - 保存/更新广告缓存

**Safety:**
- BVID 格式校验
- Rate Limiting（GET 20次/秒，POST 10次/分）
- 云端服务异常时静默降级，不影响本地检测

### Key Technical Details
- **AV to BV conversion**: Local algorithm in `BilibiliService.convertAvToBv()`
- **WBI signature**: Bilibili API requires signed parameters via `utils/wbi.ts`
- **Local Cache**: 24-hour TTL, stored in `chrome.storage.local`
- **Cloud Cache**: Cloudflare Worker + KV, 30-day TTL (7 days for inaccurate records)
- **Interactive ad markers**: Users can click to toggle segments, drag to resize
- **User feedback**: Mark results as inaccurate or submit corrections via popup
- **Graceful degradation**: Cloud cache failures silently fall back to local-only mode

## Project Layout

```
src/
├── background.ts          # Background script (cross-origin proxy)
├── content.ts            # Content script (ad detection logic)
├── popup.ts/.html       # Settings UI
├── services/
│   ├── ai.ts            # AI detection prompts and parsing
│   ├── bilibili.ts      # Bilibili API client
│   ├── cache.ts         # Detection result caching (local, 24h TTL)
│   ├── cloud-cache.ts   # Cloud cache service (Cloudflare KV)
│   ├── whitelist.ts     # UP主白名单
│   ├── audio.ts         # Audio transcription (browser-specific)
│   └── llm/             # LLM provider abstraction
│       ├── config.ts    # Provider resolution
│       ├── providers.ts # OpenAI/Anthropic/custom fetch
│       └── types.ts     # LLM types
├── utils/
│   ├── wbi.ts          # Bilibili WBI signature
│   ├── errors.ts       # Error normalization
│   └── logger.ts       # Logging utility
├── types/               # TypeScript type definitions
│   └── cloud-cache.ts  # Remote cache and feedback types
└── manifest.json        # Extension manifest

worker/                  # Cloudflare Worker (云端缓存网关)
├── src/index.ts        # Worker 入口，API 路由
├── wrangler.toml       # Worker 配置 (KV namespace binding)
├── package.json        # Worker 依赖 (wrangler)
└── README.md           # 部署文档
```
