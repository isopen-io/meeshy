/**
 * Les types du module voisin — même motif que `await-fact.d.mts` : plusieurs
 * runtimes consomment le `.mjs`, seul `tsc` lit ces déclarations.
 */

export declare const SETTLE_STEP_MS: 50;
export declare const SETTLE_ATTEMPTS: 100;

type EvaluatablePage = {
  evaluate(fn: unknown, arg?: unknown): Promise<unknown>;
  waitForTimeout(ms: number): Promise<void>;
};

export declare function waitForValueSettled(
  page: EvaluatablePage,
  evaluateFn: unknown,
  arg?: unknown,
  options?: { attempts?: number; stepMs?: number },
): Promise<unknown>;
