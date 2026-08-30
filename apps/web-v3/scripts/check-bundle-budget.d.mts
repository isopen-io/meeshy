export type StatutDePlafond = 'GATE' | 'CIBLE' | 'À ÉTABLIR';

export type NatureDeRoute = 'page' | 'gestionnaire' | 'annexe' | 'inconnue';

export type Plafond = {
  readonly valeur: number | null;
  readonly statut: StatutDePlafond;
};

export type Groupe = {
  readonly id: string;
  readonly motifs: readonly string[];
  readonly plafonds: {
    readonly socle_ko: Plafond;
    readonly ecran_ko: Plafond;
    readonly cumul_p95_ko: Plafond;
  };
};

export type RegleDeRoute = {
  readonly motifs: readonly string[];
  readonly role?: string;
  readonly plafonds: { readonly js_ko?: Plafond };
};

export type MesuresEnregistrees = {
  readonly groupes?: Readonly<
    Record<
      string,
      {
        readonly socle_ko: number | null;
        readonly ecran_ko: number | null;
        readonly cumul_p95_ko: number | null;
      }
    >
  >;
};

export type EntreeDeManifeste = {
  readonly route: string;
  readonly chunks: readonly string[];
};

export type LigneDeGroupe = {
  readonly groupe: string;
  readonly ecrans: number;
  readonly socle_ko: number | null;
  readonly socle_indetermine: string | null;
  readonly ecran_le_plus_lourd: { readonly route: string; readonly ko: number };
  readonly cumul_p95_ko: number;
  readonly plafonds: Groupe['plafonds'];
};

export type RapportDeBudget = {
  readonly routes: number;
  readonly pages: number;
  readonly gestionnaires: number;
  readonly annexes: number;
  readonly groupes: readonly LigneDeGroupe[];
  readonly depassements: readonly string[];
  readonly avertissements: readonly string[];
  readonly regressions: readonly string[];
  readonly anomalies: readonly string[];
};

export declare const natureDeRoute: (route: string) => NatureDeRoute;

export declare const estGestionnaireDeRoute: (route: string) => boolean;

export declare const normaliseRoute: (route: string) => string;

export declare const lireEntrees: (manifestSource: string) => readonly EntreeDeManifeste[];

export declare const groupeDe: (
  route: string,
  groupes: readonly Groupe[],
) => { readonly groupe: string | null; readonly ambigu: readonly string[] };

export declare const plafondDeRoute: (
  route: string,
  routes: readonly RegleDeRoute[] | undefined,
) => RegleDeRoute | null;

export declare const regressions: (
  lignes: readonly LigneDeGroupe[],
  mesuresEnregistrees: MesuresEnregistrees | null | undefined,
) => readonly string[];

export declare const mesuresDepuisLignes: (
  lignes: readonly LigneDeGroupe[],
) => Record<string, { socle_ko: number | null; ecran_ko: number; cumul_p95_ko: number }>;

export declare const composeRapport: (args: {
  readonly entrees: readonly EntreeDeManifeste[];
  readonly groupes: readonly Groupe[];
  readonly routes?: readonly RegleDeRoute[];
  readonly tailleGzip: (chunk: string) => number;
  readonly mesuresEnregistrees?: MesuresEnregistrees | null;
}) => RapportDeBudget;

export declare const formateRapport: (rapport: RapportDeBudget) => string;

export declare const verdict: (rapport: RapportDeBudget) => number;
