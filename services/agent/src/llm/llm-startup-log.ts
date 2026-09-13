export type LlmStartupLog = {
  readonly level: 'info' | 'warn';
  readonly message: string;
};

/**
 * Un démarrage sans repli armé n'est pas un état nominal : c'est le filet de
 * sécurité de `withFallback` (llm-fallback.ts) qui reste débranché. `warn`
 * fait remonter ce cas dans les tableaux d'observabilité ; `info` s'y noie
 * (#5643 — c'est exactement ce qui a laissé l'agent muet 24h en production
 * sans que personne ne le lise).
 */
export function describeLlmStartup(params: {
  readonly primaryProvider: string;
  readonly primaryModel: string;
  readonly fallbackProviderName: string;
  readonly fallbackModel: string;
  readonly fallbackArmed: boolean;
}): LlmStartupLog {
  const { primaryProvider, primaryModel, fallbackProviderName, fallbackModel, fallbackArmed } = params;

  if (fallbackArmed) {
    return {
      level: 'info',
      message: `[LLM] Primary: ${primaryProvider}/${primaryModel} | Fallback: ${fallbackProviderName}/${fallbackModel}`,
    };
  }

  return {
    level: 'warn',
    message: `[LLM] Provider: ${primaryProvider}/${primaryModel} (no fallback configured — a primary-key failure will leave the agent silent)`,
  };
}
