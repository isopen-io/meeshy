/**
 * Les types du module voisin — même motif que `settle-value.d.mts` : plusieurs
 * runtimes consomment le `.mjs`, seul `tsc` lit ces déclarations.
 */

export type Bandeau = { readonly nom: string; readonly masque: boolean };

export type ScreenTop = {
  readonly occupants: readonly string[];
  readonly bandeauBas: number;
  readonly joueurPeint: number;
  readonly bande: number;
  readonly encoche: number;
  readonly hautReserve: number;
};

export declare const BANDEAUX: readonly Bandeau[];

export declare function poseBandeau(context: { addInitScript(fn: () => void): Promise<void> }, bandeau: Bandeau): Promise<void>;

export declare function topBandSettled(page: unknown): Promise<unknown>;

export declare function screenTop(page: { evaluate(fn: unknown): Promise<unknown> }): Promise<ScreenTop | null>;

export declare function bandeauVerdict(bandeau: Bandeau, mesure: ScreenTop | null): readonly string[];
