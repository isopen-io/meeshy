/**
 * Les types du module voisin — même motif que `await-fact.d.mts` : node lit
 * le `.mjs` pour le gate, bun pour le témoin, seul `tsc` lit ces déclarations.
 */

export declare const ISOLATED_LONG_TASK_CEILING_MS: 100;

export type GlideTouch = { glide: number; offsetMs: number; duration: number };

export declare function glideLongTaskVerdict(input: {
  tasks: ReadonlyArray<{ start: number; duration: number }> | null;
  glides: ReadonlyArray<{ start: number; end: number }>;
}): { ok: boolean; tolerated: GlideTouch | null; touched: GlideTouch[] };
