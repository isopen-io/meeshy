import type { LlmProvider, LlmProviderConfig } from './types';
import { createOpenAiProvider } from './providers/openai-provider';
import { createAnthropicProvider } from './providers/anthropic-provider';

export function createLlmProvider(config: LlmProviderConfig): LlmProvider {
  switch (config.provider) {
    case 'openai':
      return createOpenAiProvider(config);
    case 'anthropic':
      return createAnthropicProvider(config);
    default:
      throw new Error(`Unknown LLM provider: ${(config as any).provider}`);
  }
}

export { type LlmProvider, type LlmProviderConfig, type LlmChatParams, type LlmChatResponse } from './types';
