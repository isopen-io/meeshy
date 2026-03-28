import type { LlmProvider, LlmProviderConfig } from './types';
import { createOpenAiProvider } from './providers/openai-provider';
import { createAnthropicProvider } from './providers/anthropic-provider';
import { withRetry } from './llm-retry';

export function createLlmProvider(config: LlmProviderConfig): LlmProvider {
  let base: LlmProvider;
  switch (config.provider) {
    case 'openai':
      base = createOpenAiProvider(config);
      break;
    case 'anthropic':
      base = createAnthropicProvider(config);
      break;
    default:
      throw new Error(`Unknown LLM provider: ${(config as any).provider}`);
  }
  return withRetry(base);
}

export { type LlmProvider, type LlmProviderConfig, type LlmChatParams, type LlmChatResponse } from './types';
