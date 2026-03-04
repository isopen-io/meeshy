export type LlmRole = 'system' | 'user' | 'assistant';

export type LlmMessage = {
  role: LlmRole;
  content: string;
};

export type LlmChatParams = {
  messages: LlmMessage[];
  temperature?: number;
  maxTokens?: number;
  systemPrompt?: string;
};

export type LlmChatResponse = {
  content: string;
  usage: { inputTokens: number; outputTokens: number };
  model: string;
  latencyMs: number;
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
