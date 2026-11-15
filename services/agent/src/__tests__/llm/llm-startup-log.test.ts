import { describeLlmStartup } from '../../llm/llm-startup-log';

describe('describeLlmStartup', () => {
  it('logs at info when a fallback is armed', () => {
    const result = describeLlmStartup({
      primaryProvider: 'openai',
      primaryModel: 'gpt-4o-mini',
      fallbackProviderName: 'anthropic',
      fallbackModel: 'claude-sonnet-4-20250514',
      fallbackArmed: true,
    });

    expect(result).toEqual({
      level: 'info',
      message: '[LLM] Primary: openai/gpt-4o-mini | Fallback: anthropic/claude-sonnet-4-20250514',
    });
  });

  it('logs at warn — not info — when no fallback is armed', () => {
    const result = describeLlmStartup({
      primaryProvider: 'openai',
      primaryModel: 'gpt-4o-mini',
      fallbackProviderName: 'anthropic',
      fallbackModel: 'claude-sonnet-4-20250514',
      fallbackArmed: false,
    });

    expect(result.level).toBe('warn');
  });

  it('names the primary provider and states the safety net is absent', () => {
    const result = describeLlmStartup({
      primaryProvider: 'openai',
      primaryModel: 'gpt-4o-mini',
      fallbackProviderName: 'anthropic',
      fallbackModel: 'claude-sonnet-4-20250514',
      fallbackArmed: false,
    });

    expect(result.message).toContain('openai/gpt-4o-mini');
    expect(result.message).toContain('no fallback configured');
  });
});
