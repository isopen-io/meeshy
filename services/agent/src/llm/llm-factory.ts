import type { LlmProvider, LlmProviderConfig } from './types';
import { createOpenAiProvider } from './providers/openai-provider';
import { createAnthropicProvider } from './providers/anthropic-provider';
import { withRetry } from './llm-retry';

/**
 * `wrapBase` enveloppe le fournisseur de BASE, sous la relance : c'est là que se pose la porte
 * du budget (#10287), pour que chaque tentative — même abandonnée par le délai de `withRetry` —
 * soit contrôlée et comptée.
 */
export function createLlmProvider(config: LlmProviderConfig, wrapBase?: (base: LlmProvider) => LlmProvider): LlmProvider {
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
  return withRetry(wrapBase ? wrapBase(base) : base);
}

export { withFallback } from './llm-fallback';
export { type LlmProvider, type LlmProviderConfig, type LlmChatParams, type LlmChatResponse } from './types';
