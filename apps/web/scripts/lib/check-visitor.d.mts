/**
 * Les types du module voisin — même motif que `await-fact.d.mts` : node joue
 * le `.mjs` dans les gates, bun dans les témoins, seul `tsc` lit ceci.
 */

export declare const SLOW_MS: 4_000;
export declare const FORMER_CUTOFF_MS: 2_500;

export declare function slowAnswerVerdict(answeredAfterMs: number): { ok: boolean; label: string };

export declare function checkVisitor(options: {
  browser: unknown;
  base: string;
  check: (ok: boolean, label: string) => void;
}): Promise<void>;
