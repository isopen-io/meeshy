import type { LlmProvider, LlmChatParams, LlmChatResponse } from './types';
import { env } from '../env';

type RetryConfig = {
  maxRetries: number;
  baseDelayMs: number;
  timeoutMs: number;
  webSearchTimeoutMs: number;
};

const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: env.LLM_MAX_RETRIES,
  baseDelayMs: env.LLM_BASE_DELAY_MS,
  timeoutMs: env.LLM_TIMEOUT_MS,
  webSearchTimeoutMs: env.LLM_WEB_SEARCH_TIMEOUT_MS,
};

function usesWebSearch(params: LlmChatParams): boolean {
  return (params.tools?.length ?? 0) > 0;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableError(error: unknown): boolean {
  if (error instanceof Error) {
    const msg = error.message.toLowerCase();
    if (msg.includes('insufficient_quota') || msg.includes('billing') || msg.includes('exceeded your current quota')) return false;
    if (msg.includes('rate limit') || msg.includes('429') || msg.includes('too many requests')) return true;
    if (msg.includes('timeout') || msg.includes('timed out') || msg.includes('econnreset')) return true;
    if (msg.includes('502') || msg.includes('503') || msg.includes('504')) return true;
    if (msg.includes('network') || msg.includes('fetch failed') || msg.includes('enotfound')) return true;
  }
  return false;
}

async function chatWithTimeout(
  provider: LlmProvider,
  params: LlmChatParams,
  timeoutMs: number,
): Promise<LlmChatResponse> {
  return new Promise<LlmChatResponse>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`LLM call timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    provider.chat(params).then(
      (result) => { clearTimeout(timer); resolve(result); },
      (error) => { clearTimeout(timer); reject(error); },
    );
  });
}

export function withRetry(provider: LlmProvider, config?: Partial<RetryConfig>): LlmProvider {
  const { maxRetries, baseDelayMs, timeoutMs, webSearchTimeoutMs } = { ...DEFAULT_RETRY_CONFIG, ...config };

  async function attemptWithRetries(params: LlmChatParams, callTimeoutMs: number): Promise<LlmChatResponse> {
    let lastError: unknown;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await chatWithTimeout(provider, params, callTimeoutMs);
      } catch (error) {
        lastError = error;
        if (attempt < maxRetries && isRetryableError(error)) {
          const delay = baseDelayMs * Math.pow(2, attempt) * (0.8 + Math.random() * 0.4);
          console.warn(`[LLM] Retry ${attempt + 1}/${maxRetries} after ${Math.round(delay)}ms: ${error instanceof Error ? error.message : 'unknown'}`);
          await sleep(delay);
          continue;
        }
        break;
      }
    }
    throw lastError;
  }

  return {
    name: provider.name,
    async chat(params: LlmChatParams): Promise<LlmChatResponse> {
      const webSearch = usesWebSearch(params);
      try {
        return await attemptWithRetries(params, webSearch ? webSearchTimeoutMs : timeoutMs);
      } catch (error) {
        if (!webSearch) throw error;
        console.warn(`[LLM] Web search exhausted (${error instanceof Error ? error.message : 'unknown'}); degrading to a tool-free retry`);
        const { tools: _tools, ...toolFree } = params;
        return attemptWithRetries(toolFree, timeoutMs);
      }
    },
  };
}
