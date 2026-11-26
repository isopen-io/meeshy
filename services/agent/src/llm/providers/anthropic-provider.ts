import type { LlmProvider, LlmChatParams, LlmChatResponse, LlmCitation, LlmProviderConfig, LlmTool } from '../types';

const ANTHROPIC_SDK_MODULE = '@anthropic-ai/sdk';
const WEB_SEARCH_TOOL_TYPE = 'web_search_20250305';
const WEB_SEARCH_MAX_USES: Record<NonNullable<LlmTool['search_context_size']>, number> = {
  low: 2,
  medium: 5,
  high: 10,
};

type ContentBlock = Record<string, unknown> & { type?: unknown; text?: unknown; citations?: unknown };

type AnthropicMessage = {
  content?: ContentBlock[];
  model?: string;
  stop_reason?: string;
  usage?: { input_tokens?: number; output_tokens?: number };
};

type AnthropicClient = {
  messages: { create(request: Record<string, unknown>): Promise<AnthropicMessage> };
};

type AnthropicConstructor = new (options: { apiKey: string }) => AnthropicClient;

function loadSdk(): AnthropicConstructor {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require(ANTHROPIC_SDK_MODULE);
    return (mod.default ?? mod.Anthropic ?? mod) as AnthropicConstructor;
  } catch {
    throw new Error('Anthropic SDK not installed. Run: pnpm add @anthropic-ai/sdk');
  }
}

function webSearchTools(tools: readonly LlmTool[] | undefined): Array<Record<string, unknown>> | undefined {
  const search = tools?.find((tool) => tool.type === 'web_search_preview');
  if (!search) return undefined;
  return [
    {
      type: WEB_SEARCH_TOOL_TYPE,
      name: 'web_search',
      max_uses: WEB_SEARCH_MAX_USES[search.search_context_size ?? 'medium'],
    },
  ];
}

/**
 * La réponse finale suit le dernier résultat de recherche : le texte d'avant
 * (« je vais chercher… ») est un préambule de l'outil, pas le message.
 */
function answerBlocks(content: readonly ContentBlock[]): ContentBlock[] {
  const lastSearch = content.map((block) => block.type).lastIndexOf('web_search_tool_result');
  return content.slice(lastSearch + 1).filter((block) => block.type === 'text');
}

function answerText(blocks: readonly ContentBlock[]): string {
  return blocks
    .map((block) => block.text)
    .filter((text): text is string => typeof text === 'string')
    .join('')
    .trim();
}

/**
 * Les citations `web_search_result_location` nomment les pages lues par la
 * recherche web : la seule source SÛRE d'une URL d'article (#6192, #6199).
 */
function extractCitations(blocks: readonly ContentBlock[]): LlmCitation[] {
  const seen = new Set<string>();
  return blocks
    .flatMap((block) => (Array.isArray(block.citations) ? (block.citations as Array<Record<string, unknown>>) : []))
    .filter((citation) => citation.type === 'web_search_result_location' && typeof citation.url === 'string')
    .filter((citation) => {
      const url = citation.url as string;
      if (seen.has(url)) return false;
      seen.add(url);
      return true;
    })
    .map((citation) => ({
      url: citation.url as string,
      ...(typeof citation.title === 'string' ? { title: citation.title } : {}),
    }));
}

export function createAnthropicProvider(config: LlmProviderConfig): LlmProvider {
  return {
    name: 'anthropic',

    async chat(params: LlmChatParams): Promise<LlmChatResponse> {
      const Anthropic = loadSdk();
      const client = new Anthropic({ apiKey: config.apiKey });
      const startTime = Date.now();

      const messages = params.messages
        .filter((msg) => msg.role !== 'system')
        .map((msg) => ({
          role: msg.role as 'user' | 'assistant',
          content: msg.content,
        }));

      const tools = webSearchTools(params.tools);

      const response = await client.messages.create({
        model: config.model,
        max_tokens: params.maxTokens ?? config.maxTokens ?? 1024,
        temperature: params.temperature ?? config.temperature ?? 0.7,
        system: params.systemPrompt,
        messages,
        ...(tools ? { tools } : {}),
      });

      if (response.stop_reason === 'pause_turn') {
        throw new Error('Anthropic web search paused (pause_turn): no final answer to serve');
      }

      const content = response.content ?? [];
      const blocks = tools ? answerBlocks(content) : content.filter((block) => block.type === 'text').slice(0, 1);
      const citations = tools ? extractCitations(blocks) : [];

      return {
        content: tools ? answerText(blocks) : typeof blocks[0]?.text === 'string' ? blocks[0].text : '',
        usage: {
          inputTokens: response.usage?.input_tokens ?? 0,
          outputTokens: response.usage?.output_tokens ?? 0,
        },
        model: response.model ?? config.model,
        latencyMs: Date.now() - startTime,
        ...(citations.length > 0 ? { citations } : {}),
      };
    },
  };
}
