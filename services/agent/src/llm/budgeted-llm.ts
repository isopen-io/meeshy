import { estimateCostUsd } from '../tracing/cost-estimator';
import type { DailyBudgetManager } from '../scheduler/daily-budget';
import type { LlmChatParams, LlmChatResponse, LlmProvider } from './types';

/**
 * #10287 — le budget quotidien en dollars (`AgentGlobalConfig.globalDailyBudgetUsd`)
 * et le plafond d'appels simultanés (`maxConcurrentCalls`) sont APPLIQUÉS, plus
 * seulement tracés.
 *
 * La porte enveloppe CHAQUE fournisseur de base (primaire et secours), SOUS la
 * couche de relance (`createLlmProvider(config, gate.wrap)`) : chaque tentative,
 * y compris celle que `withRetry` abandonne à son délai mais qui continue chez le
 * fournisseur, est contrôlée, tient sa place jusqu'à sa vraie fin, et est comptée.
 * - avant l'appel : la dépense du jour (UTC, Redis) est lue ; au budget ou au-delà,
 *   l'appel est refusé (`LlmBudgetExceededError`) sans atteindre le fournisseur.
 *   Compteur ou configuration illisible ⇒ refus (fermé) ;
 * - après l'appel servi : son coût estimé est ajouté — jetons au tarif du modèle
 *   (prudent pour un modèle inconnu), forfait par recherche web, et un minimum
 *   déduit du texte quand le fournisseur ne rend aucun comptage.
 * Dépassement possible borné : les appels déjà partis quand le budget est franchi
 * (au plus `maxConcurrentCalls`, par processus) finissent et sont comptés.
 */

export const DEFAULT_DAILY_BUDGET_USD = 10;
/** Forfait prudent par appel avec recherche web (OpenAI facture ~25 $ / 1000 appels, hors jetons). */
export const WEB_SEARCH_CALL_USD = 0.03;

export class LlmBudgetExceededError extends Error {
  constructor(readonly spentUsd: number, readonly budgetUsd: number) {
    super(`Daily LLM budget reached: $${spentUsd.toFixed(4)} spent of $${budgetUsd.toFixed(2)}`);
    this.name = 'LlmBudgetExceededError';
  }
}

/** Le budget du jour : la valeur de la configuration globale si elle est un nombre ≥ 0, sinon le défaut du schéma. */
export function resolveDailyBudgetUsd(globalConfig: { globalDailyBudgetUsd?: unknown } | null | undefined): number {
  const value = globalConfig?.globalDailyBudgetUsd;
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : DEFAULT_DAILY_BUDGET_USD;
}

export function resolveMaxConcurrentCalls(globalConfig: { maxConcurrentCalls?: unknown } | null | undefined): number {
  const value = Number(globalConfig?.maxConcurrentCalls);
  return Number.isInteger(value) && value >= 1 ? value : 5;
}

/** Le coût d'un appel servi, en dollars. */
export function callCostUsd(params: LlmChatParams, response: LlmChatResponse): number {
  let { inputTokens, outputTokens } = response.usage ?? { inputTokens: 0, outputTokens: 0 };
  if (!(inputTokens > 0) && !(outputTokens > 0)) {
    // Aucun comptage rendu (proxy, fournisseur muet) : ~4 caractères par jeton, jamais 0 $.
    const promptChars = (params.systemPrompt?.length ?? 0) + params.messages.reduce((n, m) => n + m.content.length, 0);
    inputTokens = Math.ceil(promptChars / 4);
    outputTokens = Math.ceil((response.content?.length ?? 0) / 4);
  }
  const webSearch = params.tools?.some((t) => t.type === 'web_search_preview') ? WEB_SEARCH_CALL_USD : 0;
  return estimateCostUsd(response.model, inputTokens, outputTokens) + webSearch;
}

type Limits = {
  budgetUsd: () => Promise<number>;
  maxConcurrentCalls: () => Promise<number>;
};

export class LlmBudgetGate {
  private inFlight = 0;
  private waiting: Array<() => void> = [];

  constructor(
    private readonly budget: DailyBudgetManager,
    private readonly limits: Limits,
  ) {}

  /** Enveloppe un fournisseur de BASE (à placer sous `withRetry`). Toutes les enveloppes partagent la même porte. */
  readonly wrap = (inner: LlmProvider): LlmProvider => ({
    get name() {
      return inner.name;
    },
    chat: (params: LlmChatParams) => this.run(inner, params),
  });

  private async acquire(): Promise<void> {
    for (;;) {
      const max = await this.limits.maxConcurrentCalls();
      if (this.inFlight < max) {
        this.inFlight++;
        return;
      }
      await new Promise<void>((resolve) => this.waiting.push(resolve));
    }
  }

  private release(): void {
    this.inFlight--;
    this.waiting.shift()?.();
  }

  private async run(inner: LlmProvider, params: LlmChatParams): Promise<LlmChatResponse> {
    await this.acquire();
    try {
      // Lu APRÈS la file d'attente : un appel qui a attendu sa place voit la dépense des précédents.
      const budgetUsd = await this.limits.budgetUsd();
      const check = await this.budget.canSpendLlm(budgetUsd);
      if (!check.allowed) {
        console.warn(`[LLM-Budget] Call refused: $${check.spentUsd.toFixed(4)} spent of $${budgetUsd.toFixed(2)} today`);
        throw new LlmBudgetExceededError(check.spentUsd, budgetUsd);
      }
      const response = await inner.chat(params);
      await this.budget.recordLlmSpend(callCostUsd(params, response));
      return response;
    } finally {
      this.release();
    }
  }
}
