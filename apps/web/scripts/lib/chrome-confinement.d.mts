/**
 * Les types du module voisin — même motif que `reach-at-rest.d.mts` et
 * `gate-server.d.mts` : trois runtimes consomment le `.mjs` (Vite, bun, node),
 * seul `tsc` lit ces déclarations.
 */
import type { Page } from '@playwright/test';

export type Boite = {
  readonly top: number;
  readonly left: number;
  readonly right: number;
  readonly bottom: number;
  readonly height: number;
};

/** Les encarts SÛRS tels que l'application les déclare (`--safe-top`, …). */
export type Encarts = {
  readonly haut: number;
  readonly bas: number;
  readonly gauche: number;
  readonly droite: number;
};

export type FaitsConfinement = {
  readonly rect: (Boite & { readonly width: number }) | null;
  /** La CIBLE touchée — la boîte de bordure élargie d'un `::after` de prise. */
  readonly cible: { readonly height: number } | null;
  readonly cadre: { readonly largeur: number; readonly hauteur: number };
  readonly sur: Encarts;
};

/** Les manquements de confinement — `[]` vaut « confiné ». */
export declare function confinement(params: {
  readonly rect: Boite | null;
  /** La cible touchée. Absente ⇒ le plancher se mesure sur `rect`. */
  readonly cible?: { readonly height: number } | null;
  readonly cadre: { readonly largeur: number; readonly hauteur: number };
  readonly sur: Encarts;
  /** La hauteur de cible minimale. Défaut 44. */
  readonly plancher?: number;
}): readonly string[];

export declare function mesurerConfinement(page: Page, selecteur: string): Promise<FaitsConfinement>;

/** La mesure et son verdict, en une phrase lisible au journal d'un gate. */
export declare function confinementDe(
  page: Page,
  selecteur: string,
  options?: { readonly nom?: string; readonly plancher?: number },
): Promise<{ readonly ok: boolean; readonly message: string }>;
