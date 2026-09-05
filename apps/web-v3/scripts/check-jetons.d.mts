import type { Feuille } from './lib/cascade.d.mts';

export type Occurrence = {
  readonly ligne: number;
  readonly texte: string;
};

export type OccurrenceSituee = Occurrence & {
  readonly fichier: string;
};

export type BlocCss = {
  readonly selecteurs: readonly string[];
  readonly jetons: Readonly<Record<string, string>>;
};

export type JetonOrphelin = {
  readonly fichier: string;
  readonly jeton: string;
  readonly manque: string;
};

export type ContrasteInsuffisant = {
  readonly schema: string;
  readonly encre: string;
  readonly fond: string;
  readonly seuil: number;
  readonly rapport: number | null;
};

export type PlanDesordonne = {
  readonly schema: string;
  readonly dessous: string;
  readonly plan: string;
  readonly ecart: number | null;
};

/**
 * Un FOND sur lequel aucun des deux anneaux de focus ne tient 3:1 — la
 * disjonction de la règle 15, qu'une paire de contraste ne sait pas exprimer.
 */
export type FocusInvisible = {
  readonly fond: string;
  readonly meilleur: number | null;
};

export type FocusInvisibleSitue = FocusInvisible & {
  readonly schema: string;
};

export type SuiviDeLOS = {
  readonly classe: string;
  readonly propriete: string;
  readonly sombre: string | null;
  readonly clair: string | null;
};

export type RapportDeJetons = {
  readonly infractions: readonly OccurrenceSituee[];
  readonly dimensions: readonly OccurrenceSituee[];
  readonly bascules: readonly OccurrenceSituee[];
  readonly moteurs: readonly OccurrenceSituee[];
  readonly orphelins: readonly JetonOrphelin[];
  readonly contrastes: readonly ContrasteInsuffisant[];
  readonly ordres: readonly PlanDesordonne[];
  readonly focus: readonly FocusInvisibleSitue[];
  readonly suivis: readonly SuiviDeLOS[];
};

export declare const couleursLitterales: (source: string) => readonly Occurrence[];

export declare const dimensionsLitterales: (source: string) => readonly Occurrence[];

export declare const basculesAutomatiques: (source: string) => readonly Occurrence[];

export declare const moteursParalleles: (
  source: string,
  fichier: string,
) => readonly Occurrence[];

export declare const suivisDeLOS: (feuilles: readonly Feuille[]) => readonly SuiviDeLOS[];

export declare const blocsCss: (source: string) => readonly BlocCss[];

export declare const fichiersDeLaV3: (racine: string) => readonly string[];

export declare const jetonsOrphelins: (racineJetons: string) => readonly JetonOrphelin[];

export declare const contrastesInsuffisants: (
  racineJetons: string,
) => readonly ContrasteInsuffisant[];

export declare const plansDesordonnes: (racineJetons: string) => readonly PlanDesordonne[];

export declare const focusInvisiblesDans: (
  table: Readonly<Record<string, string>>,
) => readonly FocusInvisible[];

export declare const focusInvisibles: (
  racineJetons: string,
) => readonly FocusInvisibleSitue[];

export declare const audit: (args: {
  readonly racineV3: string;
  readonly racineJetons: string;
}) => RapportDeJetons;

export declare const formateAudit: (rapport: RapportDeJetons) => string;

export declare const verdict: (rapport: RapportDeJetons) => number;
