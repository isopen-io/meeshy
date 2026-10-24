/**
 * Les types du module voisin — même motif que `await-fact.d.mts` : plusieurs
 * runtimes consomment le `.mjs`, seul `tsc` lit ces déclarations.
 */

export type Constate = (vrai: boolean, quoi: string) => void;

export declare function runBounded(
  taches: ReadonlyArray<(constate: Constate) => Promise<void>>,
  limite: number,
): Promise<string[]>;
