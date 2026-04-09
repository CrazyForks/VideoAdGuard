import { LLMProvider, ResolvedLLMSettings, StoredLLMSettings } from './types';

export const DEFAULT_BASE_URLS: Record<LLMProvider, string> = {
  openai: 'https://api.openai.com/v1',
  anthropic: 'https://api.anthropic.com',
  custom_fetch: 'http://localhost:11434',
};

export const DEFAULT_MODEL = '';
export const STORAGE_KEYS = ['provider', 'baseUrl', 'apiUrl', 'apiKey', 'model', 'enableLocalOllama'] as const;

export function resolveLLMSettings(settings: StoredLLMSettings): ResolvedLLMSettings {
  const provider = inferProvider(settings, settings.apiUrl);
  const baseUrl = resolveBaseUrl(settings, provider);
  const apiUrl = buildApiUrl(provider, baseUrl);

  return {
    provider,
    apiUrl,
    apiKey: settings.apiKey || null,
    model: (settings.model || DEFAULT_MODEL).trim(),
    baseUrl,
  };
}

export function inferProvider(settings: StoredLLMSettings, apiUrl?: string): LLMProvider {
  if (settings.provider) {
    if (settings.provider === 'compatible') return 'openai';
    if (settings.provider === 'ollama') return 'custom_fetch';
    return settings.provider;
  }

  if (settings.enableLocalOllama) {
    return 'custom_fetch';
  }

  const resolvedUrl = (apiUrl || resolveApiUrl(settings)).toLowerCase();
  if (resolvedUrl.includes('localhost') || resolvedUrl.includes('127.0.0.1') || resolvedUrl.includes('0.0.0.0')) {
    return 'custom_fetch';
  }
  if (resolvedUrl.includes('anthropic.com')) {
    return 'anthropic';
  }
  return 'openai';
}

export function getDefaultBaseUrl(provider: LLMProvider): string {
  return DEFAULT_BASE_URLS[provider];
}

export function buildApiUrl(provider: LLMProvider, baseUrl: string): string {
  const normalizedBaseUrl = trimTrailingSlash(baseUrl);

  switch (provider) {
    case 'anthropic':
      return normalizedBaseUrl.endsWith('/v1')
        ? `${normalizedBaseUrl}/messages`
        : `${normalizedBaseUrl}/v1/messages`;
    case 'custom_fetch': {
      const endpointKind = detectCustomFetchEndpointKind(normalizedBaseUrl);
      if (endpointKind === 'full') return normalizedBaseUrl;
      if (endpointKind === 'openai') return `${normalizedBaseUrl}/chat/completions`;
      return normalizedBaseUrl.endsWith('/api')
        ? `${normalizedBaseUrl}/chat`
        : `${normalizedBaseUrl}/api/chat`;
    }
    case 'openai':
    default:
      return `${normalizedBaseUrl}/chat/completions`;
  }
}

function detectCustomFetchEndpointKind(baseUrl: string): 'full' | 'openai' | 'ollama' {
  if (
    baseUrl.endsWith('/api/chat') ||
    baseUrl.endsWith('/v1/chat/completions') ||
    baseUrl.endsWith('/chat/completions') ||
    baseUrl.endsWith('/v1/messages') ||
    baseUrl.endsWith('/messages')
  ) {
    return 'full';
  }

  if (baseUrl.endsWith('/v1') || baseUrl.includes('/v1/')) {
    return 'openai';
  }

  return 'ollama';
}

function resolveApiUrl(settings: StoredLLMSettings): string {
  if (settings.apiUrl) return settings.apiUrl;
  const provider = inferProvider(settings);
  return buildApiUrl(provider, resolveBaseUrl(settings, provider));
}

function resolveBaseUrl(settings: StoredLLMSettings, provider: LLMProvider): string {
  if (settings.baseUrl) return trimTrailingSlash(settings.baseUrl);
  if (settings.apiUrl) return normalizeBaseUrl(settings.apiUrl, provider);
  return getDefaultBaseUrl(provider);
}

function normalizeBaseUrl(apiUrl: string, provider: LLMProvider): string {
  switch (provider) {
    case 'anthropic':
      return trimSuffixes(apiUrl, ['/v1/messages', '/messages']);
    case 'custom_fetch':
      return trimSuffixes(apiUrl, ['/api/chat', '/v1/chat/completions', '/chat/completions', '/messages', '/v1/messages']);
    case 'openai':
    default:
      return trimSuffixes(apiUrl, ['/chat/completions', '/responses']);
  }
}

function trimSuffixes(url: string, suffixes: string[]): string {
  for (const suffix of suffixes) {
    if (url.endsWith(suffix)) {
      return url.slice(0, -suffix.length);
    }
  }
  return url;
}

function trimTrailingSlash(url: string): string {
  return url.endsWith('/') ? url.slice(0, -1) : url;
}
