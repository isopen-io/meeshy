export type LlmRole = 'system' | 'user' | 'assistant';

export type LlmMessage = {
  role: LlmRole;
  content: string;
};

export type LlmTool = {
  type: 'web_search_preview';
  search_context_size?: 'low' | 'medium' | 'high';
};

export type LlmChatParams = {
  messages: LlmMessage[];
  temperature?: number;
  maxTokens?: number;
  systemPrompt?: string;
  tools?: LlmTool[];
};

export type LlmCitation = {
  url: string;
  title?: string;
};

export type LlmChatResponse = {
  content: string;
  usage: { inputTokens: number; outputTokens: number };
  model: string;
  latencyMs: number;
  /** Pages web citées par la réponse (recherche web), dédupliquées, dans l'ordre. Absent hors recherche web. */
  citations?: readonly LlmCitation[];
};

export type LlmProvider = {
  readonly name: string;
  chat(params: LlmChatParams): Promise<LlmChatResponse>;
};

export type LlmProviderConfig = {
  provider: 'openai' | 'anthropic';
  apiKey: string;
  model: string;
  baseUrl?: string;
  maxTokens?: number;
  temperature?: number;
};
