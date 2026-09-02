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

export declare const estCodeDeMesure: (http: number | null) => boolean;

export declare const budgetsReseau: () => BudgetReseau | null;

export declare const profilReseau: () => ProfilReseau | null;

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

/**
 * Le contexte de navigateur dont `mesurePage` a besoin — structurel, pour que ce
 * fichier de déclarations ne dépende pas de Playwright. Un appelant lui passe un
 * `Browser` ; le seul membre qu'il utilise est `newContext`.
 */
export type NavigateurDeMesure = {
  newContext(options: Record<string, unknown>): Promise<{
    newPage(): Promise<unknown>;
    newCDPSession(page: unknown): Promise<unknown>;
    /**
     * Facultatif dans le CONTRAT parce qu'il l'est à l'usage : `mesurePage` ne
     * l'appelle que si des cookies lui sont passés. L'exiger de tout navigateur
     * obligerait chaque double de test à porter une méthode qu'il ne verra
     * jamais appelée — un contrat plus large que le besoin.
     */
    addCookies?(cookies: readonly CookieDeMesure[]): Promise<void>;
    close(): Promise<void>;
  }>;
};

/** Un cookie posé avant la navigation — la forme que Playwright accepte. */
export type CookieDeMesure = {
  readonly name: string;
  readonly value: string;
  readonly url: string;
};

export declare const mesurePage: (args: {
  readonly url: string;
  readonly commande: string;
  readonly navigateur: NavigateurDeMesure;
  readonly viewport?: { readonly width: number; readonly height: number };
  readonly timeoutMs?: number;
  readonly profil?: ProfilReseau | null;
  /** L'agent servi à la page. Défaut : l'iPhone du § 8.3. */
  readonly userAgent?: string;
  /**
   * Les cookies posés AVANT la navigation. `/` sert la vitrine sans eux et le
   * tableau de bord avec (§ 12.2) : sans cette option, un gate sur l'écran
   * connecté mesurerait l'écran public (§ 12.6).
   */
  readonly cookies?: readonly CookieDeMesure[];
}) => Promise<Mesure>;

export declare const mesureUrls: (
  urls: readonly string[],
  commandePour: (url: string) => string,
  options?: {
    readonly repetitions?: number;
    readonly rang?: number;
    readonly profil?: ProfilReseau | null;
  },
) => Promise<readonly Mesure[]>;
