import type { Mesure, ProfilReseau } from './mesure-reseau.d.mts';

export type CibleDeProduction = {
  readonly geste: string;
  readonly route: string;
  readonly url: string;
};

export type LigneDeBaseline = Mesure;

export type PointOuvert = {
  readonly quoi: string;
  readonly a_rejouer: string;
  readonly prerequis: readonly string[];
  readonly verifier: string;
};

export type Baseline = {
  readonly mesure: string;
  readonly source: string;
  readonly produit_par: string;
  readonly date: string;
  readonly etablie: boolean;
  readonly profil: ProfilReseau | null;
  readonly repetitions: number | null;
  readonly percentile: number | null;
  readonly point_ouvert: PointOuvert | null;
  readonly mesures: readonly LigneDeBaseline[];
};

export declare const POINT_OUVERT: PointOuvert;

export declare const CIBLES_PRODUCTION: readonly CibleDeProduction[];

export declare const commandePour: (url: string) => string;

export declare const estPlaceholder: (url: string) => boolean;

export declare const estDeProduction: (url: string) => boolean;

export declare const routeDe: (url: string) => string | null;

export type OptionsDeMesure = {
  readonly profil: ProfilReseau | null;
  readonly repetitions: number;
  readonly rang: number;
};

export declare const optionsDeMesure: () => OptionsDeMesure;

export type ChiffresDeLigneDeBase = {
  readonly date: string;
  readonly cibles: number;
  readonly mesurees: number;
  readonly octets_max_ko: number;
  readonly requetes_avant_premier_pixel_max: number;
  readonly lcp_max_ms: number;
  readonly profil: string;
  readonly repetitions: number | null;
  readonly percentile: number | null;
};

export type VerdictDeLigneDeBase = {
  readonly statut: 'vert' | 'rouge' | 'non exécutée';
  readonly raison: string | null;
  readonly chiffres: ChiffresDeLigneDeBase | null;
};

export declare const verdictDeLigneDeBase: (valeur: unknown) => VerdictDeLigneDeBase;

export declare const composeBaseline: (args: {
  readonly date: string;
  readonly mesures: readonly LigneDeBaseline[];
  readonly profil?: ProfilReseau | null;
}) => Baseline;
