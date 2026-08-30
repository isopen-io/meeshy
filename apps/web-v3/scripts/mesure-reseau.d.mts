export type Chargement = {
  readonly requestId: string;
  readonly encodedDataLength: number;
};

export type Reponse = {
  readonly requestId: string;
  readonly type: string;
};

export type Ressource = {
  readonly startTime: number;
};

export type OctetsParType = Readonly<
  Record<string, { readonly requetes: number; readonly octets: number }>
>;

export type Mesure = {
  readonly url: string;
  readonly commande: string;
  readonly statut: 'mesuré' | 'à établir';
  readonly raison: string | null;
  readonly http: number | null;
  readonly octets_transferes: number | null;
  readonly requetes: number | null;
  readonly requetes_avant_premier_pixel: number | null;
  readonly requetes_pendantes: number | null;
  readonly octets_par_type: OctetsParType | null;
  readonly fcp_ms: number | null;
  readonly lcp_ms: number | null;
  readonly cls: number | null;
  readonly duree_ms: number | null;
  readonly executions?: number;
  readonly percentile?: number;
};

export type PlafondReseau = {
  readonly valeur: number | null;
  readonly statut: 'GATE' | 'CIBLE' | 'À ÉTABLIR';
  readonly source?: string;
};

export type ProfilReseau = {
  readonly nom: string;
  readonly download_bps: number;
  readonly upload_bps: number;
  readonly latence_ms: number;
  readonly repetitions?: number;
  readonly percentile?: number;
};

export type BudgetReseau = {
  readonly profil?: ProfilReseau;
  readonly transverses?: Readonly<Record<string, PlafondReseau>>;
  readonly ecrans?: readonly {
    readonly motifs: readonly string[];
    readonly role?: string;
    readonly plafonds: Readonly<Record<string, PlafondReseau>>;
  }[];
};

export type Franchissement = {
  readonly url: string;
  readonly mesure: string;
  readonly statut: PlafondReseau['statut'];
  readonly texte: string;
};

export type VerdictReseau = {
  readonly mesures: readonly Mesure[];
  readonly depassements: readonly string[];
  readonly avertissements: readonly string[];
  readonly non_mesurees: readonly string[];
  readonly rc: number;
};

export declare const octetsTransferes: (chargements: readonly Chargement[]) => number;

export declare const octetsParType: (
  reponses: readonly Reponse[],
  chargements: readonly Chargement[],
) => OctetsParType;

export declare const requetesAvantPremierPixel: (
  ressources: readonly Ressource[],
  fcpMs: number | null,
) => number | null;

export declare const requetesPendantes: (emises: number, terminees: number) => number;

export declare const percentile: (
  valeurs: readonly (number | null)[],
  rang: number,
) => number | null;

export declare const composeMesure: (args: {
  readonly url: string;
  readonly commande: string;
  readonly http: number;
  readonly dureeMs: number;
  readonly requetesEmises: number;
  readonly requetesTerminees?: number;
  readonly reponses: readonly Reponse[];
  readonly chargements: readonly Chargement[];
  readonly ressources: readonly Ressource[];
  readonly fcpMs: number | null;
  readonly lcpMs: number | null;
  readonly cls: number | null;
}) => Mesure;

export declare const mesureIndisponible: (args: {
  readonly url: string;
  readonly commande: string;
  readonly raison: string;
}) => Mesure;

export declare const agregeExecutions: (args: {
  readonly url: string;
  readonly commande: string;
  readonly executions: readonly Mesure[];
  readonly rang: number;
}) => Mesure;

export declare const cheminDe: (url: string) => string;

export declare const plafondsDuChemin: (
  chemin: string,
  reseau: BudgetReseau | null | undefined,
) => Readonly<Record<string, PlafondReseau>>;

export declare const franchissementsReseau: (
  mesure: Mesure,
  reseau: BudgetReseau | null | undefined,
) => readonly Franchissement[];

export declare const composeVerdictReseau: (
  mesures: readonly Mesure[],
  reseau: BudgetReseau | null | undefined,
) => VerdictReseau;

export declare const raisonLisible: (erreur: unknown) => string;

export declare const mesureUrls: (
  urls: readonly string[],
  commandePour: (url: string) => string,
  options?: {
    readonly repetitions?: number;
    readonly rang?: number;
    readonly profil?: ProfilReseau | null;
  },
) => Promise<readonly Mesure[]>;
