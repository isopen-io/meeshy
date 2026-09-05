// Une ligne de `vues.json`. `jetons` y est déclaré OPTIONNEL et n'y est jamais
// ÉCRIT : le type doit pouvoir dire l'état fautif — un jeton posé dans le
// fichier régénéré — pour que `jetonsHorsAnnexe` puisse le nommer.
export type LigneDeVue = {
  readonly id: string;
  readonly label: string;
  readonly route: string;
  readonly group: string;
  readonly title: string;
  readonly subtitle: string;
  readonly png: string;
  readonly jetons?: Readonly<Record<string, string>>;
};

export type IndexDeVues = {
  readonly source: string;
  readonly count: number;
  readonly vues: readonly LigneDeVue[];
};

// L'annexe écrite à la main. `pourquoi` porte la raison d'être du fichier, que
// JSON ne sait pas mettre en commentaire — et qu'un lecteur doit trouver AVANT
// de songer à replier ces valeurs dans `vues.json`.
export type EtatDeSession = {
  readonly pourquoi?: string;
  readonly cookies: Readonly<Record<string, string>>;
};

export type AnnexeDeJetons = {
  readonly pourquoi?: readonly string[];
  /** Les états de session qu'une vue peut réclamer par `@session` — leurs cookies, ceux de la passerelle de bouchon. */
  readonly sessions?: Readonly<Record<string, EtatDeSession>>;
  readonly jetons: Readonly<Record<string, Readonly<Record<string, string>>>>;
};

export type RefusDIndex = {
  readonly id: string;
  readonly raison: string;
};

export type LectureDeVues = {
  readonly source: string;
  readonly vues: readonly LigneDeVue[];
  readonly sessions: Readonly<Record<string, EtatDeSession>>;
  readonly refus: readonly RefusDIndex[];
};

export declare const NOM_INDEX: 'vues.json';
export declare const NOM_JETONS: 'jetons-de-vues.json';
export declare const NOM_LISIBLE: 'vues.md';

export declare const CHAMPS_REGENERES: readonly string[];

export declare const indexRegenere: (entree: {
  readonly source: string;
  readonly vues: readonly LigneDeVue[];
}) => IndexDeVues;

export declare const documentDesVues: (entree: {
  readonly source: string;
  readonly vues: readonly LigneDeVue[];
}) => string;

export declare const ecrisLIndex: (entree: {
  readonly dossier: string;
  readonly source: string;
  readonly vues: readonly LigneDeVue[];
}) => IndexDeVues;

export declare const vuesJointes: (entree: {
  readonly index: IndexDeVues;
  readonly jetons: AnnexeDeJetons['jetons'];
}) => readonly LigneDeVue[];

export declare const CLE_DE_SESSION: '@session';

/** L'état de session qu'une vue RÉCLAME — `null` quand elle se sert sans créance. */
export declare const sessionDeVue: (vue: LigneDeVue | undefined) => string | null;

/** Les vues qui réclament un état de session que l'annexe ne déclare pas — refusées, et NOMMÉES. */
export declare const sessionsInconnues: (entree: {
  readonly vues: readonly LigneDeVue[];
  readonly sessions: Readonly<Record<string, unknown>>;
}) => readonly RefusDIndex[];

export declare const jetonsHorsAnnexe: (index: IndexDeVues) => readonly RefusDIndex[];

export declare const litLesVues: (dossier: string) => LectureDeVues;
