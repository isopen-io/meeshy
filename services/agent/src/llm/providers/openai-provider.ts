import OpenAI from 'openai';
import type { LlmProvider, LlmChatParams, LlmChatResponse, LlmProviderConfig } from '../types';

function extractResponsesContent(output: Array<Record<string, unknown>>): string {
  const parts: string[] = [];
  for (const item of output) {
    if (item.type === 'message' && Array.isArray(item.content)) {
      for (const block of item.content as Array<Record<string, unknown>>) {
        if (block.type === 'output_text' && typeof block.text === 'string') {
          parts.push(block.text);
        }
      }
    }
  }
  return parts.join('\n').trim();
}

export function createOpenAiProvider(config: LlmProviderConfig): LlmProvider {
  const client = new OpenAI({
    apiKey: config.apiKey,
    baseURL: config.baseUrl,
  });

  return {
    name: 'openai',

    async chat(params: LlmChatParams): Promise<LlmChatResponse> {
      const startTime = Date.now();
      const temperature = params.temperature ?? config.temperature ?? 0.7;
      const maxTokens = params.maxTokens ?? config.maxTokens ?? 1024;

      const hasWebSearch = params.tools?.some((t) => t.type === 'web_search_preview');

      if (hasWebSearch) {
        const input: Array<Record<string, unknown>> = [];
        if (params.systemPrompt) {
          input.push({ role: 'developer', content: params.systemPrompt });
        }
        for (const msg of params.messages) {
          input.push({ role: msg.role, content: msg.content });
        }

        const tools = params.tools!.map((t) => ({
          type: t.type as 'web_search_preview',
          search_context_size: t.search_context_size ?? 'medium',
        }));

        const response = await (client.responses as any).create({
          model: config.model,
          input,
          tools,
          temperature,
          max_output_tokens: maxTokens,
        });

        const content = extractResponsesContent(response.output ?? []);

        return {
          content,
          usage: {
            inputTokens: response.usage?.input_tokens ?? 0,
            outputTokens: response.usage?.output_tokens ?? 0,
          },
          model: response.model ?? config.model,
          latencyMs: Date.now() - startTime,
        };
      }

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
        temperature,
        max_tokens: maxTokens,
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
