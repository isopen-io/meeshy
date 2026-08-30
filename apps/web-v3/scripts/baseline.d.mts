import type { Mesure } from './mesure-reseau.d.mts';

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
  readonly point_ouvert: PointOuvert | null;
  readonly mesures: readonly LigneDeBaseline[];
};

export declare const POINT_OUVERT: PointOuvert;

export declare const CIBLES_PRODUCTION: readonly CibleDeProduction[];

export declare const commandePour: (url: string) => string;

export declare const estPlaceholder: (url: string) => boolean;

export declare const composeBaseline: (args: {
  readonly date: string;
  readonly mesures: readonly LigneDeBaseline[];
}) => Baseline;
