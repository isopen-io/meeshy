import type { LlmProvider, LlmChatParams, LlmChatResponse, LlmProviderConfig } from '../types';

const ANTHROPIC_SDK_MODULE = '@anthropic-ai/sdk';

export function createAnthropicProvider(config: LlmProviderConfig): LlmProvider {
  return {
    name: 'anthropic',

    async chat(params: LlmChatParams): Promise<LlmChatResponse> {
      let Anthropic: any;
      try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const mod = require(ANTHROPIC_SDK_MODULE);
        Anthropic = mod.default ?? mod.Anthropic ?? mod;
      } catch {
        throw new Error('Anthropic SDK not installed. Run: pnpm add @anthropic-ai/sdk');
      }

      const client = new Anthropic({ apiKey: config.apiKey });
      const startTime = Date.now();

      const messages = params.messages
        .filter((msg) => msg.role !== 'system')
        .map((msg) => ({
          role: msg.role as 'user' | 'assistant',
          content: msg.content,
        }));

      const response = await client.messages.create({
        model: config.model,
        max_tokens: params.maxTokens ?? config.maxTokens ?? 1024,
        temperature: params.temperature ?? config.temperature ?? 0.7,
        system: params.systemPrompt,
        messages,
      });

      const textBlock = response.content.find((b: any) => b.type === 'text');

      return {
        content: textBlock?.text ?? '',
        usage: {
          inputTokens: response.usage?.input_tokens ?? 0,
          outputTokens: response.usage?.output_tokens ?? 0,
        },
        model: response.model,
        latencyMs: Date.now() - startTime,
      };
    },
  };
}
