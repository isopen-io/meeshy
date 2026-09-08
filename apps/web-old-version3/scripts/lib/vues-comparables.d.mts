export type VueCible = {
  readonly id: string;
  readonly route: string;
  readonly jetons?: Readonly<Record<string, string>>;
};

export type VueComparable = {
  readonly id: string;
  readonly route: string;
  readonly chemin: string;
};

export type RefusDeVue = {
  readonly id: string;
  readonly raison: string;
};

// Une résolution qui échoue NOMME ce qui manque : un appelant qui ne peut dire
// QUEL jeton n'a pas été déclaré se contente d'un « non comparable » que
// personne ne sait corriger.
export type ResolutionDeChemin =
  | { readonly ok: true; readonly chemin: string }
  | { readonly ok: false; readonly raison: string; readonly manquants: readonly string[] };

// `ignorees` n'est PAS un refus : sans `--vues`, écarter les routes paramétrées
// est le comportement documenté de l'outil. Les rendre le rend seulement VISIBLE.
export type SelectionDeVues = {
  readonly comparables: readonly VueComparable[];
  readonly ignorees: readonly string[];
  readonly refus: readonly RefusDeVue[];
};

export type RefusDeSelection = {
  readonly rc: 3;
  readonly messages: readonly string[];
};

export declare const RC_CONFORME: 0;
export declare const RC_HORS_CIBLE: 1;
export declare const RC_ECHEC: 2;
export declare const RC_NON_COMPARABLE: 3;

export declare const jetonsDeRoute: (route: string) => readonly string[];

export declare const estRouteParametree: (route: string) => boolean;

export declare const cheminDeVue: (vue: VueCible) => ResolutionDeChemin;

export declare const selectionComparable: (entree: {
  readonly vues: readonly VueCible[];
  readonly demandees: readonly string[];
}) => SelectionDeVues;

export declare const refusDeSelection: (selection: SelectionDeVues) => RefusDeSelection | null;
