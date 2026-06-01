process.env.DATABASE_URL = 'mongodb://mock';
process.env.OPENAI_API_KEY = 'mock-key';
import { withRetry } from '../../llm/llm-retry';
import type { LlmProvider, LlmChatParams, LlmChatResponse } from '../../llm/types';

function makeResponse(content: string): LlmChatResponse {
  return { content, usage: { inputTokens: 1, outputTokens: 1 }, model: 'mock', latencyMs: 0 };
}

function recordingProvider(
  handler: (params: LlmChatParams, callIndex: number) => Promise<LlmChatResponse>,
): LlmProvider & { calls: LlmChatParams[] } {
  const calls: LlmChatParams[] = [];
  return {
    name: 'mock',
    calls,
    async chat(params: LlmChatParams): Promise<LlmChatResponse> {
      const idx = calls.length;
      calls.push(params);
      return handler(params, idx);
    },
  };
}

function delayedResolve(ms: number, content: string): Promise<LlmChatResponse> {
  return new Promise((resolve) => setTimeout(() => resolve(makeResponse(content)), ms));
}

const fastConfig = { maxRetries: 1, baseDelayMs: 1 };
const webSearchParams: LlmChatParams = {
  messages: [{ role: 'user', content: 'hi' }],
  tools: [{ type: 'web_search_preview', search_context_size: 'medium' }],
};

describe('withRetry — web search timeout handling', () => {
  it('applies the longer web-search timeout to tool calls (would fail at the normal timeout)', async () => {
    const provider = recordingProvider(() => delayedResolve(40, 'ok'));
    const wrapped = withRetry(provider, { ...fastConfig, timeoutMs: 15, webSearchTimeoutMs: 200 });

    const result = await wrapped.chat(webSearchParams);

    expect(result.content).toBe('ok');
    expect(provider.calls[0].tools).toBeDefined();
  });

  it('degrades to a tool-free retry when every web-search attempt times out', async () => {
    const provider = recordingProvider((params) =>
      (params.tools?.length ?? 0) > 0
        ? delayedResolve(100, 'with-tools')
        : delayedResolve(1, 'without-tools'),
    );
    const wrapped = withRetry(provider, {
      ...fastConfig,
      timeoutMs: 50,
      webSearchTimeoutMs: 20,
    });

    const result = await wrapped.chat(webSearchParams);

    expect(result.content).toBe('without-tools');
    const lastCall = provider.calls[provider.calls.length - 1];
    expect(lastCall.tools).toBeUndefined();
  });

  it('throws the original error if even the tool-free fallback fails', async () => {
    const provider = recordingProvider(() => Promise.reject(new Error('LLM call timed out after 20ms')));
    const wrapped = withRetry(provider, { ...fastConfig, timeoutMs: 50, webSearchTimeoutMs: 20 });

    await expect(wrapped.chat(webSearchParams)).rejects.toThrow(/timed out/);
  });
});

describe('withRetry — non-tool calls unaffected', () => {
  it('returns a successful non-tool call without adding a fallback attempt', async () => {
    const provider = recordingProvider(() => delayedResolve(1, 'plain'));
    const wrapped = withRetry(provider, { ...fastConfig, timeoutMs: 200 });

    const result = await wrapped.chat({ messages: [{ role: 'user', content: 'hi' }] });

    expect(result.content).toBe('plain');
    expect(provider.calls).toHaveLength(1);
  });

  it('retries retryable errors on plain calls', async () => {
    let attempts = 0;
    const provider = recordingProvider(() => {
      attempts++;
      return attempts === 1
        ? Promise.reject(new Error('503 service unavailable'))
        : Promise.resolve(makeResponse('recovered'));
    });
    const wrapped = withRetry(provider, { ...fastConfig, timeoutMs: 200 });

    const result = await wrapped.chat({ messages: [{ role: 'user', content: 'hi' }] });

    expect(result.content).toBe('recovered');
    expect(attempts).toBe(2);
  });
});
