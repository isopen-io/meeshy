/**
 * LES CONSTANTES DU PARTAGE TEMPORAIRE DE POSITION (#14109, #16980) — durées,
 * précisions, bornes et codes. Hors de `./shared-location.ts` pour qu'un client léger
 * (le web) les lise sans Zod.
 */

/** Un partage dure 1 h ou 8 h, puis s'arrête seul (LOC-02). */
export const SHARED_LOCATION_DURATIONS_MINUTES = [60, 480] as const;
export type SharedLocationDurationMinutes = (typeof SHARED_LOCATION_DURATIONS_MINUTES)[number];

/**
 * Ce qu'un destinataire voit (LOC-06, RG-15) : la position exacte, le quartier ou la
 * ville. La ville est le défaut : on ouvre plus, jamais l'inverse.
 */
export const SHARED_LOCATION_PRECISIONS = ['exact', 'neighborhood', 'city'] as const;
export type SharedLocationPrecision = (typeof SHARED_LOCATION_PRECISIONS)[number];
export const SHARED_LOCATION_DEFAULT_PRECISION: SharedLocationPrecision = 'city';

/**
 * Le pas de la grille sur laquelle une position floutée est posée, en degrés : le
 * centre de la maille, toujours le même pour une même maille. Un flou aléatoire se
 * moyennerait sur les mises à jour successives ; une grille ne livre rien de plus en
 * mille envois qu'en un.
 */
export const SHARED_LOCATION_GRID_DEGREES = { neighborhood: 0.01, city: 0.1 } as const;

/**
 * La marge au-delà de la ligne de maille avant qu'un lecteur flouté change de maille, en
 * fraction du pas : le va-et-vient du bruit GPS près d'une ligne ne la révèle pas (#16987).
 * La maille servie est donc à au plus `0,5 + marge` pas de la position vraie sur chaque axe.
 */
export const SHARED_LOCATION_CELL_HOLD_MARGIN = 0.25;

/**
 * Le rayon du cercle de flou que le lecteur dessine, en mètres : la demi-diagonale de la
 * maille ÉLARGIE de la marge (0,75 pas par axe, au pire à l'équateur), arrondie au-dessus.
 * Le cercle contient toujours la position vraie, même quand la maille est retenue (#16987).
 */
export const SHARED_LOCATION_BLUR_RADIUS_METERS = { neighborhood: 1200, city: 12000 } as const;

/** La précision exacte ne descend jamais sous ce rayon, même si l'appareil annonce mieux. */
export const SHARED_LOCATION_EXACT_MIN_RADIUS_METERS = 10;

export const SHARED_LOCATION_RECIPIENTS_MAX = 50;

/**
 * Le cercle d'où vient la personne, tel que la loi d'accès vient de le juger pour CE
 * lecteur (#17013, #17966) : le marqueur de la carte en tire son icône et sa couleur,
 * et aucun client ne le recalcule. Un partage temporaire s'ouvre dès Ami, donc rien
 * en dessous ; un cercle absent (serveur antérieur) se dessine en marqueur neutre.
 */
export const SHARED_LOCATION_CIRCLES = ['FRIEND', 'CLOSE', 'BLOOD'] as const;
export type SharedLocationCircle = (typeof SHARED_LOCATION_CIRCLES)[number];

export const SHARED_LOCATION_ERROR_CODES = {
  /** Charge illisible (coordonnées hors bornes, durée inconnue, destinataire en double, champ en trop). */
  INVALID: 'SHARED_LOCATION_INVALID',
  /** Une mise à jour sans partage en cours (jamais démarré, arrêté ou échu). */
  NOT_SHARING: 'SHARED_LOCATION_NOT_SHARING',
  /** Trop d'envois. */
  RATE_LIMITED: 'SHARED_LOCATION_RATE_LIMITED',
  /** Le serveur ne peut pas sceller ou ranger la position : rien ne part. */
  UNAVAILABLE: 'SHARED_LOCATION_UNAVAILABLE',
} as const;
export type SharedLocationErrorCode = (typeof SHARED_LOCATION_ERROR_CODES)[keyof typeof SHARED_LOCATION_ERROR_CODES];
