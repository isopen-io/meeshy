/**
 * #10287 — le budget quotidien en dollars de l'agent est APPLIQUÉ.
 * Tout appel LLM de l'agent (scanner, réactif, lecture, saison) passe par
 * `LlmBudgetGate`, posée sous la relance de chaque fournisseur de base : au-delà du
 * budget du jour, l'appel est refusé AVANT d'atteindre le fournisseur, et le coût de
 * chaque tentative servie est compté.
 */
process.env.DATABASE_URL = 'mongodb://mock';
process.env.OPENAI_API_KEY = 'mock-key';
import fs from 'fs';
import path from 'path';
import { LlmBudgetGate, LlmBudgetExceededError, WEB_SEARCH_CALL_USD, callCostUsd, resolveDailyBudgetUsd } from '../../llm/budgeted-llm';
import { withRetry } from '../../llm/llm-retry';
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
  const gate = new LlmBudgetGate(budget, {
    budgetUsd: async () => opts.budgetUsd ?? 2,
    maxConcurrentCalls: async () => opts.maxConcurrent ?? 5,
  });
  const llm = gate.wrap(inner);
  return { redis, budget, inner, llm, gate };
}

const PARAMS = { messages: [{ role: 'user' as const, content: 'salut' }] };

describe('LlmBudgetGate (#10287)', () => {
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

describe('LlmBudgetGate sous la relance (audit #10302)', () => {
  beforeEach(() => jest.spyOn(console, 'warn').mockImplementation(() => {}));
  afterEach(() => jest.restoreAllMocks());

  it('compte chaque tentative abandonnée par le délai de withRetry, et tient sa place jusqu’à sa vraie fin', async () => {
    let billed = 0;
    let inFlight = 0;
    let peak = 0;
    const base: LlmProvider = {
      name: 'slow',
      chat: async () => {
        inFlight++;
        peak = Math.max(peak, inFlight);
        await new Promise((r) => setTimeout(r, 60));
        inFlight--;
        billed++;
        return RESPONSE; // 0,75 $
      },
    };
    const budget = new DailyBudgetManager(memoryRedis() as any);
    const gate = new LlmBudgetGate(budget, { budgetUsd: async () => 1, maxConcurrentCalls: async () => 1 });
    const llm = withRetry(gate.wrap(base), { maxRetries: 2, baseDelayMs: 1, timeoutMs: 10 });

    await Promise.allSettled([llm.chat(PARAMS), llm.chat(PARAMS)]);
    await new Promise((r) => setTimeout(r, 400));

    expect(peak).toBe(1);
    // Le 1er appel servi franchit le budget (0,75 $ puis 1,50 $ au plus) : tout le reste est refusé.
    expect(billed).toBeLessThanOrEqual(2);
    expect(await budget.getLlmSpendToday()).toBeCloseTo(billed * 0.75, 6);
  });

  it('createLlmProvider pose la porte SOUS la relance', async () => {
    jest.resetModules();
    const calls: string[] = [];
    jest.doMock('../../llm/providers/openai-provider', () => ({
      createOpenAiProvider: () => ({ name: 'openai', chat: async () => { calls.push('base'); return RESPONSE; } }),
    }));
    jest.doMock('../../llm/llm-retry', () => ({
      withRetry: (p: LlmProvider) => ({ name: p.name, chat: async (x: any) => { calls.push('retry'); return p.chat(x); } }),
    }));
    const { createLlmProvider } = await import('../../llm/llm-factory');
    const llm = createLlmProvider({ provider: 'openai', apiKey: 'k', model: 'gpt-4o-mini' }, (b) => ({
      name: b.name,
      chat: async (x) => { calls.push('gate'); return b.chat(x); },
    }));
    await llm.chat(PARAMS);
    expect(calls).toEqual(['retry', 'gate', 'base']);
    jest.dontMock('../../llm/providers/openai-provider');
    jest.dontMock('../../llm/llm-retry');
  });

  it('server.ts passe la porte à CHAQUE fournisseur qu’il crée (primaire et secours)', () => {
    const source = fs.readFileSync(path.resolve(__dirname, '..', '..', 'server.ts'), 'utf8');
    const creations = source.match(/createLlmProvider\(\{[\s\S]*?\}(, budgetGate\.wrap)?\)/g) ?? [];
    expect(creations.length).toBeGreaterThanOrEqual(2);
    for (const c of creations) expect(c).toMatch(/, budgetGate\.wrap\)$/);
    expect(source).not.toMatch(/new Budgeted|withRetry\(/);
  });
});

describe('callCostUsd (audit #10302)', () => {
  it('ajoute un forfait par appel avec recherche web', () => {
    const plain = callCostUsd(PARAMS, { ...RESPONSE, usage: { inputTokens: 1000, outputTokens: 100 } });
    const web = callCostUsd({ ...PARAMS, tools: [{ type: 'web_search_preview' }] }, { ...RESPONSE, usage: { inputTokens: 1000, outputTokens: 100 } });
    expect(web - plain).toBeCloseTo(WEB_SEARCH_CALL_USD, 9);
  });

  it('ne compte jamais 0 $ pour une réponse servie sans comptage de jetons', () => {
    const cost = callCostUsd({ messages: [{ role: 'user', content: 'x'.repeat(4000) }] }, { ...RESPONSE, content: 'y'.repeat(400), usage: { inputTokens: 0, outputTokens: 0 } });
    expect(cost).toBeGreaterThan(0);
  });

  it('un modèle inconnu est compté au tarif du plus cher (jamais sous-estimé)', () => {
    const unknown = callCostUsd(PARAMS, { ...RESPONSE, model: 'claude-opus-9', usage: { inputTokens: 1_000_000, outputTokens: 1_000_000 } });
    expect(unknown).toBeGreaterThanOrEqual(15 + 75);
  });
});
