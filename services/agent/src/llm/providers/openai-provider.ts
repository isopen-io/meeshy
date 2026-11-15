import OpenAI from 'openai';
import type { LlmProvider, LlmChatParams, LlmChatResponse, LlmCitation, LlmProviderConfig } from '../types';

type ResponsesBlock = Record<string, unknown> & { annotations?: unknown };

function outputTextBlocks(output: Array<Record<string, unknown>>): ResponsesBlock[] {
  return output.flatMap((item) =>
    item.type === 'message' && Array.isArray(item.content)
      ? (item.content as ResponsesBlock[]).filter((block) => block.type === 'output_text')
      : [],
  );
}

function extractResponsesContent(output: Array<Record<string, unknown>>): string {
  return outputTextBlocks(output)
    .map((block) => block.text)
    .filter((text): text is string => typeof text === 'string')
    .join('\n')
    .trim();
}

/**
 * Les annotations `url_citation` d'une réponse avec recherche web nomment les
 * pages sur lesquelles le modèle s'est appuyé. Elles étaient jetées : c'est
 * pourtant la seule source SÛRE d'une URL d'article — demander l'URL au modèle
 * en texte l'invite à l'inventer (#6192).
 */
function extractCitations(output: Array<Record<string, unknown>>): LlmCitation[] {
  const seen = new Set<string>();
  return outputTextBlocks(output)
    .flatMap((block) => (Array.isArray(block.annotations) ? (block.annotations as Array<Record<string, unknown>>) : []))
    .filter((annotation) => annotation.type === 'url_citation' && typeof annotation.url === 'string')
    .filter((annotation) => {
      const url = annotation.url as string;
      if (seen.has(url)) return false;
      seen.add(url);
      return true;
    })
    .map((annotation) => ({
      url: annotation.url as string,
      ...(typeof annotation.title === 'string' ? { title: annotation.title } : {}),
    }));
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
        const citations = extractCitations(response.output ?? []);

        return {
          content,
          usage: {
            inputTokens: response.usage?.input_tokens ?? 0,
            outputTokens: response.usage?.output_tokens ?? 0,
          },
          model: response.model ?? config.model,
          latencyMs: Date.now() - startTime,
          ...(citations.length > 0 ? { citations } : {}),
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
