import { createLlmProvider } from '../../llm/llm-factory';

describe('LLM Factory', () => {
  it('creates an OpenAI provider', () => {
    const provider = createLlmProvider({
      provider: 'openai',
      apiKey: 'test-key',
      model: 'gpt-4o-mini',
    });
    expect(provider.name).toBe('openai');
  });

  it('creates an Anthropic provider', () => {
    const provider = createLlmProvider({
      provider: 'anthropic',
      apiKey: 'test-key',
      model: 'claude-sonnet-4-20250514',
    });
    expect(provider.name).toBe('anthropic');
  });

  it('throws on unknown provider', () => {
    expect(() =>
      createLlmProvider({
        provider: 'unknown' as any,
        apiKey: 'test-key',
        model: 'model',
      }),
    ).toThrow('Unknown LLM provider: unknown');
  });
});
