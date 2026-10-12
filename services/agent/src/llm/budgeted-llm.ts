import { estimateCostUsd } from '../tracing/cost-estimator';
import type { DailyBudgetManager } from '../scheduler/daily-budget';
import type { LlmChatParams, LlmChatResponse, LlmProvider } from './types';

/**
 * #10287 — le budget quotidien en dollars (`AgentGlobalConfig.globalDailyBudgetUsd`)
 * et le plafond d'appels simultanés (`maxConcurrentCalls`) sont APPLIQUÉS, plus
 * seulement tracés.
 *
 * Toute sortie vers le fournisseur LLM de l'agent passe par cette enveloppe
 * (graphe du scanner, chemin réactif, lecture du pont, proposition de saison) :
 * - avant l'appel : la dépense du jour (UTC, Redis) est lue ; au budget ou au-delà,
 *   l'appel est refusé (`LlmBudgetExceededError`) sans atteindre le fournisseur.
 *   Compteur illisible ⇒ refus (fermé) ;
 * - après l'appel servi : son coût estimé (`estimateCostUsd`, tarif prudent pour
 *   un modèle inconnu) est ajouté au compteur.
 * Dépassement possible borné : les appels déjà partis quand le budget est franchi
 * (au plus `maxConcurrentCalls`) finissent et sont comptés.
 */

export const DEFAULT_DAILY_BUDGET_USD = 10;

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
  const value = globalConfig?.maxConcurrentCalls;
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 ? value : 5;
}

type Limits = {
  budgetUsd: () => Promise<number>;
  maxConcurrentCalls: () => Promise<number>;
};

export class BudgetedLlmProvider implements LlmProvider {
  private inFlight = 0;
  private waiting: Array<() => void> = [];

  constructor(
    private readonly inner: LlmProvider,
    private readonly budget: DailyBudgetManager,
    private readonly limits: Limits,
  ) {}

  get name(): string {
    return this.inner.name;
  }

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

  async chat(params: LlmChatParams): Promise<LlmChatResponse> {
    await this.acquire();
    try {
      // Lu APRÈS la file d'attente : un appel qui a attendu sa place voit la dépense des précédents.
      const budgetUsd = await this.limits.budgetUsd();
      const check = await this.budget.canSpendLlm(budgetUsd);
      if (!check.allowed) {
        console.warn(`[LLM-Budget] Call refused: $${check.spentUsd.toFixed(4)} spent of $${budgetUsd.toFixed(2)} today`);
        throw new LlmBudgetExceededError(check.spentUsd, budgetUsd);
      }
      const response = await this.inner.chat(params);
      const cost = estimateCostUsd(response.model, response.usage.inputTokens, response.usage.outputTokens);
      await this.budget.recordLlmSpend(cost);
      return response;
    } finally {
      this.release();
    }
  }
}
