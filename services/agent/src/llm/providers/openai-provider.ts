import OpenAI from 'openai';
import type { LlmProvider, LlmChatParams, LlmChatResponse, LlmProviderConfig } from '../types';

export function createOpenAiProvider(config: LlmProviderConfig): LlmProvider {
  const client = new OpenAI({
    apiKey: config.apiKey,
    baseURL: config.baseUrl,
  });

  return {
    name: 'openai',

    async chat(params: LlmChatParams): Promise<LlmChatResponse> {
      const startTime = Date.now();

      const messages: OpenAI.ChatCompletionMessageParam[] = [];
      if (params.systemPrompt) {
        messages.push({ role: 'system', content: params.systemPrompt });
      }
      for (const msg of params.messages) {
        messages.push({ role: msg.role, content: msg.content });
      }

      const response = await client.chat.completions.create({
        model: config.model,
        messages,
        temperature: params.temperature ?? config.temperature ?? 0.7,
        max_tokens: params.maxTokens ?? config.maxTokens ?? 1024,
      });

      const choice = response.choices[0];

      return {
        content: choice?.message?.content ?? '',
        usage: {
          inputTokens: response.usage?.prompt_tokens ?? 0,
          outputTokens: response.usage?.completion_tokens ?? 0,
        },
        model: response.model,
        latencyMs: Date.now() - startTime,
      };
    },
  };
}
