/**
 * Les types du module voisin — même motif que `browser.d.mts` et
 * `check-media-grid.d.mts` : plusieurs runtimes consomment le `.mjs` (node
 * pour les gates, bun pour les témoins), seul `tsc` lit ces déclarations.
 */

export declare const FACT_CEILING_MS: 10_000;

type WaitableLocator = {
  waitFor(options: { state: 'attached' | 'detached' | 'visible' | 'hidden'; timeout: number }): Promise<void>;
};

type WaitableConditionPage = {
  waitForFunction(
    predicate: unknown,
    arg: unknown,
    options: { polling: number; timeout: number },
  ): Promise<unknown>;
};

export declare function awaitFact(
  locator: WaitableLocator,
  options?: { state?: 'attached' | 'detached' | 'visible' | 'hidden'; timeoutMs?: number },
): Promise<boolean>;

export declare function awaitCondition(
  page: WaitableConditionPage,
  predicate: unknown,
  arg?: unknown,
  options?: { timeoutMs?: number },
): Promise<boolean>;
