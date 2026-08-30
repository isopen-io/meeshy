import type { PorteurDeMotifs } from './motifs.mjs';

export type NatureDeRoute = 'page' | 'gestionnaire' | 'annexe' | 'inconnue';

export type EntreeDeManifeste = {
  readonly route: string;
  readonly chunks: readonly string[];
};

// Ce qu'il faut pour CLASSER une route dans un groupe : son identité et ses motifs. Les plafonds
// ne servent qu'à la MESURER. Deux consommateurs distincts, deux exigences distinctes — sans quoi
// tout lecteur du seul classement (le gate axe du § 8.5) devrait fabriquer des plafonds vides.
export type PorteurDeGroupe = {
  readonly id: string;
  readonly motifs: readonly string[];
};

export declare const natureDeRoute: (route: string) => NatureDeRoute;

export declare const estGestionnaireDeRoute: (route: string) => boolean;

export declare const normaliseRoute: (route: string) => string;

export declare const lireEntrees: (manifestSource: string) => readonly EntreeDeManifeste[];

export declare const groupeDe: (
  route: string,
  groupes: readonly PorteurDeGroupe[],
) => { readonly groupe: string | null; readonly ambigu: readonly string[] };

export declare const plafondDeRoute: <T extends PorteurDeMotifs>(
  route: string,
  routes: readonly T[] | undefined,
) => T | null;
