/**
 * Les types du module voisin — même motif que `gate-server.d.mts` et
 * `browser.d.mts` : trois runtimes consomment le `.mjs` (Vite, bun, node),
 * seul `tsc` lit ces déclarations.
 */
import type { Page } from '@playwright/test';

/**
 * Un cadre qui ÉCRÊTE — le rectangle d'un ancêtre en `overflow` non visible,
 * et les axes sur lesquels un GESTE ramène ce qui en sort. Un écrêteur qui ne
 * défile pas n'excuse rien : ce qu'il perd est perdu.
 */
export type Ecran = {
  readonly nom: string;
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly defileX: boolean;
  readonly defileY: boolean;
};

/**
 * Le FAIT relevé dans la page — jamais un verdict. `declare` porte ce que
 * l'AUTEUR a déclaré (`inert`, `aria-hidden`, `hidden`, `visibility:hidden`),
 * jamais une déduction.
 */
export type FaitAtteinte = {
  readonly nom: string;
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
  readonly toucher: 'lui-même' | 'un autre' | 'rien';
  readonly par: string;
  readonly declare: string | null;
  readonly ecrans: readonly Ecran[];
  readonly cadre: { readonly largeur: number; readonly hauteur: number };
};

/** Écarté, sous une raison ÉCRITE — jamais par un tableau vide. */
export type Ecarte = {
  readonly exclu: true;
  readonly nom: string;
  readonly raison: string;
};

/** Mesuré. `raison` vaut `atteint`, `volé` ou `hors viewport`. */
export type Mesure = {
  readonly exclu: false;
  readonly nom: string;
  readonly ok: boolean;
  readonly par: string;
  readonly hauteur: number;
  readonly raison: 'atteint' | 'volé' | 'hors viewport';
};

export declare function classerAtteinte(fait: FaitAtteinte): Ecarte | Mesure;

/** Ce qu'un gate LIT des mesures — la forme qu'il lisait déjà, plus `raison`. */
export type Atteinte = Omit<Mesure, 'exclu'>;

export type ReleveAtteinte = {
  readonly controls: readonly Atteinte[];
  readonly texts: readonly Atteinte[];
  readonly exclus: readonly { readonly quoi: string; readonly nom: string; readonly raison: string }[];
};

/** Le décompte des écartés, groupé par raison — destiné au JOURNAL du gate. */
export declare function resumeExclusions(releve: ReleveAtteinte): string;

export declare function reachAtRest(
  page: Page,
  options: {
    /** Les contrôles à mesurer. */
    readonly controls: string;
    /** Les textes à mesurer. Absent ⇒ aucun. */
    readonly texts?: string;
    /**
     * Élargit la cible du toucher des TEXTES — et d'eux seuls — à l'ancêtre le
     * plus proche qui correspond : `check-notifications` juge qu'un texte de
     * rangée est atteint dès que le point retombe sur SA RANGÉE, pas sur le
     * `<span>` exact. Un contrôle se juge toujours sur lui-même.
     */
    readonly porteeTextes?: string;
  },
): Promise<ReleveAtteinte>;
