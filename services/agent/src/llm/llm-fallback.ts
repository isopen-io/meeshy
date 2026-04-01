import type { LlmProvider, LlmChatParams, LlmChatResponse } from './types';

function isFatalProviderError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const msg = error.message.toLowerCase();
  return (
    msg.includes('insufficient_quota') ||
    msg.includes('exceeded your current quota') ||
    msg.includes('billing') ||
    msg.includes('account deactivated') ||
    msg.includes('invalid_api_key') ||
    msg.includes('authentication') ||
    msg.includes('permission denied')
  );
}

export function withFallback(primary: LlmProvider, fallback: LlmProvider): LlmProvider {
  let primaryDisabled = false;
  let disabledAt = 0;
  const COOLDOWN_MS = 5 * 60 * 1000;

  return {
    get name() {
      if (primaryDisabled && Date.now() - disabledAt < COOLDOWN_MS) {
        return `${fallback.name} (fallback)`;
      }
      return primary.name;
    },
    async chat(params: LlmChatParams): Promise<LlmChatResponse> {
      if (primaryDisabled && Date.now() - disabledAt < COOLDOWN_MS) {
        return fallback.chat(params);
      }

      if (primaryDisabled) {
        primaryDisabled = false;
        console.log(`[LLM-Fallback] Cooldown expired, retrying primary provider: ${primary.name}`);
      }

      try {
        return await primary.chat(params);
      } catch (error) {
        if (isFatalProviderError(error)) {
          primaryDisabled = true;
          disabledAt = Date.now();
          console.warn(`[LLM-Fallback] Primary provider "${primary.name}" fatally failed, switching to "${fallback.name}" for ${COOLDOWN_MS / 60000}min: ${error instanceof Error ? error.message : 'unknown'}`);
          return fallback.chat(params);
        }
        throw error;
      }
    },
  };
}
