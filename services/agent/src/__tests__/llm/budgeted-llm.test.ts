/**
 * #10287 — le budget quotidien en dollars de l'agent est APPLIQUÉ.
 * Tout appel LLM de l'agent (scanner, réactif, lecture, saison) passe par
 * `BudgetedLlmProvider` : au-delà du budget du jour, l'appel est refusé AVANT
 * d'atteindre le fournisseur, et le coût de chaque appel servi est compté.
 */
import { BudgetedLlmProvider, LlmBudgetExceededError, resolveDailyBudgetUsd } from '../../llm/budgeted-llm';
import { DailyBudgetManager } from '../../scheduler/daily-budget';
import type { LlmChatResponse, LlmProvider } from '../../llm/types';

function memoryRedis() {
  const store = new Map<string, string>();
  return {
    store,
    get: jest.fn(async (k: string) => store.get(k) ?? null),
    incrbyfloat: jest.fn(async (k: string, by: number) => {
      const next = parseFloat(store.get(k) ?? '0') + by;
      store.set(k, String(next));
      return String(next);
    }),
    expire: jest.fn(async () => 1),
  };
}

// gpt-4o-mini : 0,15 $ / M en entrée, 0,60 $ / M en sortie → 1 M + 1 M = 0,75 $.
const RESPONSE: LlmChatResponse = { content: 'ok', usage: { inputTokens: 1_000_000, outputTokens: 1_000_000 }, model: 'gpt-4o-mini', latencyMs: 5 };

function setup(opts: { budgetUsd?: number; maxConcurrent?: number; inner?: LlmProvider } = {}) {
  const redis = memoryRedis();
  const budget = new DailyBudgetManager(redis as any);
  const inner: LlmProvider = opts.inner ?? { name: 'fake', chat: jest.fn(async () => RESPONSE) };
  const llm = new BudgetedLlmProvider(inner, budget, {
    budgetUsd: async () => opts.budgetUsd ?? 2,
    maxConcurrentCalls: async () => opts.maxConcurrent ?? 5,
  });
  return { redis, budget, inner, llm };
}

const PARAMS = { messages: [{ role: 'user' as const, content: 'salut' }] };

describe('BudgetedLlmProvider (#10287)', () => {
  beforeEach(() => jest.spyOn(console, 'warn').mockImplementation(() => {}));
  afterEach(() => jest.restoreAllMocks());

  it('laisse passer un appel sous le budget et compte son coût en dollars', async () => {
    const { llm, inner, budget } = setup({ budgetUsd: 2 });
    await expect(llm.chat(PARAMS)).resolves.toEqual(RESPONSE);
    expect(inner.chat).toHaveBeenCalledTimes(1);
    expect(await budget.getLlmSpendToday()).toBeCloseTo(0.75, 6);
  });

  it("refuse l'appel suivant une fois le budget du jour atteint — le fournisseur n'est plus appelé", async () => {
    const { llm, inner, budget } = setup({ budgetUsd: 1.5 });
    await llm.chat(PARAMS); // 0,75
    await llm.chat(PARAMS); // 1,50 — budget atteint
    await expect(llm.chat(PARAMS)).rejects.toBeInstanceOf(LlmBudgetExceededError);
    await expect(llm.chat(PARAMS)).rejects.toBeInstanceOf(LlmBudgetExceededError);
    expect(inner.chat).toHaveBeenCalledTimes(2);
    expect(await budget.getLlmSpendToday()).toBeCloseTo(1.5, 6);
  });

  it('un budget de 0 $ refuse tout appel', async () => {
    const { llm, inner } = setup({ budgetUsd: 0 });
    await expect(llm.chat(PARAMS)).rejects.toBeInstanceOf(LlmBudgetExceededError);
    expect(inner.chat).not.toHaveBeenCalled();
  });

  it('fermé si le compteur est illisible (Redis en panne) : aucun appel non compté', async () => {
    const { llm, inner, redis } = setup();
    redis.get.mockRejectedValueOnce(new Error('redis down'));
    await expect(llm.chat(PARAMS)).rejects.toThrow();
    expect(inner.chat).not.toHaveBeenCalled();
  });

  it("n'autorise pas plus de maxConcurrentCalls appels simultanés", async () => {
    let inFlight = 0;
    let peak = 0;
    const inner: LlmProvider = {
      name: 'slow',
      chat: jest.fn(async () => {
        inFlight++;
        peak = Math.max(peak, inFlight);
        await new Promise((r) => setTimeout(r, 10));
        inFlight--;
        return { ...RESPONSE, usage: { inputTokens: 10, outputTokens: 10 } };
      }),
    };
    const { llm } = setup({ maxConcurrent: 2, budgetUsd: 100, inner });
    await Promise.all(Array.from({ length: 6 }, () => llm.chat(PARAMS)));
    expect(inner.chat).toHaveBeenCalledTimes(6);
    expect(peak).toBe(2);
  });

  it('ne compte rien pour un appel en échec chez le fournisseur, et libère sa place', async () => {
    const inner: LlmProvider = { name: 'ko', chat: jest.fn(async () => { throw new Error('500'); }) };
    const { llm, budget } = setup({ maxConcurrent: 1, inner });
    await expect(llm.chat(PARAMS)).rejects.toThrow('500');
    await expect(llm.chat(PARAMS)).rejects.toThrow('500');
    expect(await budget.getLlmSpendToday()).toBe(0);
  });

  it('expose le nom du fournisseur enveloppé', () => {
    expect(setup().llm.name).toBe('fake');
  });
});

describe('resolveDailyBudgetUsd', () => {
  it('lit globalDailyBudgetUsd, et retombe sur 10 $ (défaut du schéma) sinon', () => {
    expect(resolveDailyBudgetUsd({ globalDailyBudgetUsd: 3 })).toBe(3);
    expect(resolveDailyBudgetUsd({ globalDailyBudgetUsd: 0 })).toBe(0);
    expect(resolveDailyBudgetUsd(null)).toBe(10);
    expect(resolveDailyBudgetUsd({ globalDailyBudgetUsd: -1 })).toBe(10);
    expect(resolveDailyBudgetUsd({ globalDailyBudgetUsd: Number.NaN })).toBe(10);
  });
});
