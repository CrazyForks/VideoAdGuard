# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Git 相关

不要自己提交git，在完成完整任务后，附加一个commit信息给我，我来提交

## Build Commands

```bash
npm install          # Install dependencies
npm run build       # Build for both Chrome and Firefox
npm run build:chrome  # Build Chrome extension only
npm run build:firefox # Build Firefox extension only
npm run clean       # Clean build artifacts
```

## Architecture

### Browser Extension Structure
The extension uses a multi-script architecture:
- **content.ts**: Main ad detection logic, runs on B站 video pages
- **background.ts**: Handles cross-origin requests (LLM API calls, audio transcription)
- **popup.ts/popup.html**: Settings UI for API configuration

### Ad Detection Flow
1. Content script extracts video BV号 from URL
2. Fetches video metadata, subtitles, and top comments via BilibiliService
3. Sends data to LLM for analysis via background script
4. Parses JSON response to get ad time ranges
5. Injects skip button and interactive markers onto video player

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

### Key Technical Details
- **AV to BV conversion**: Local algorithm in `BilibiliService.convertAvToBv()`
- **WBI signature**: Bilibili API requires signed parameters via `utils/wbi.ts`
- **Cache**: 24-hour TTL, stored in `chrome.storage.local`
- **Interactive ad markers**: Users can click to toggle segments, drag to resize

## Project Layout

```
src/
├── background.ts          # Background script (cross-origin proxy)
├── content.ts            # Content script (ad detection logic)
├── popup.ts/.html       # Settings UI
├── services/
│   ├── ai.ts            # AI detection prompts and parsing
│   ├── bilibili.ts      # Bilibili API client
│   ├── cache.ts         # Detection result caching
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
└── types/               # TypeScript type definitions
```
