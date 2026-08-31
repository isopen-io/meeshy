export declare const COMPOSE_DE_PRODUCTION: string;

export declare const ROUTEUR_V3: string;

export declare const PREFIXE_DE_ZONE: string;

export declare const ZONE_DACTIFS: string;

export type CheminReclame = {
  readonly matcher: 'Path' | 'PathPrefix';
  readonly valeur: string;
};

export declare const regleDuRouteur: (compose: string, routeur?: string) => string | null;

export declare const cheminsReclames: (regle: string) => readonly CheminReclame[];

export declare const capture: (reclame: CheminReclame, chemin: string) => boolean;

export declare const perimetreDeNavigation: (compose: string) => readonly CheminReclame[];

export declare const litLePerimetre: (racineDuDepot: string) => readonly CheminReclame[];

/** `null` — et NON un périmètre vide — quand le compose est hors du contexte (image Docker). */
export declare const litLePerimetreSiPresent: (
  racineDuDepot: string,
) => readonly CheminReclame[] | null;

export declare const cheminDOrigine: (href: unknown) => string | null;

export declare const servieParLaV3: (
  chemin: string,
  perimetre: readonly CheminReclame[],
) => boolean;
