/**
 * Les types du module voisin — même motif que `await-fact.d.mts` : node lit le
 * `.mjs` (le cadre téléphone), bun le témoigne, seul `tsc` lit ces déclarations.
 */

export declare const PROGRESSION_CONCEPTS: readonly string[];
export declare const PROGRESSION_PAGES: readonly string[];
export declare const GAME_LONG_FLAG: string;
export declare const LANGUAGE_KEY: string;
export declare const LONG_LEVEL: string;
export declare const PROGRESSION_GABARITS: readonly {
  readonly viewport: { readonly width: number; readonly height: number };
  readonly langues: readonly string[];
}[];

export type SidewaysReleve =
  | { readonly chemin: string; readonly sansContenu: true; readonly enChargement: false }
  | {
      readonly chemin: string;
      readonly sansContenu: false;
      readonly enChargement: boolean;
      readonly defilants: readonly string[];
      readonly debords: readonly string[];
      readonly rogne: number;
      readonly verrou: boolean;
      readonly surdefilement: string;
      readonly elements: number;
      readonly niveau: string | null;
    };

export declare function sidewaysReleve(): SidewaysReleve;
