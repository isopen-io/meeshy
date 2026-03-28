import type { LlmProvider, LlmChatParams, LlmChatResponse } from './types';

type RetryConfig = {
  maxRetries: number;
  baseDelayMs: number;
  timeoutMs: number;
};

const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 2,
  baseDelayMs: 1000,
  timeoutMs: 30_000,
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableError(error: unknown): boolean {
  if (error instanceof Error) {
    const msg = error.message.toLowerCase();
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
  const { maxRetries, baseDelayMs, timeoutMs } = { ...DEFAULT_RETRY_CONFIG, ...config };

  return {
    name: provider.name,
    async chat(params: LlmChatParams): Promise<LlmChatResponse> {
      let lastError: unknown;
      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
          return await chatWithTimeout(provider, params, timeoutMs);
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
    },
  };
}
