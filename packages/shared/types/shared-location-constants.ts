/**
 * LES CONSTANTES DU PARTAGE TEMPORAIRE DE POSITION (#14109, #16980) — durées,
 * précisions, bornes et codes. Hors de `./shared-location.ts` pour qu'un client léger
 * (le web) les lise sans Zod.
 */

/** Un partage dure 1 h ou 8 h, puis s'arrête seul (LOC-02). */
export const SHARED_LOCATION_DURATIONS_MINUTES = [60, 480] as const;
export type SharedLocationDurationMinutes = (typeof SHARED_LOCATION_DURATIONS_MINUTES)[number];

/**
 * L'échéance d'UNE personne, en secondes à compter de la réception (#18205) : au plus le
 * plus long partage. Relative et non datée, pour qu'une horloge d'appareil en avance ou en
 * retard ne la déplace pas ; la passerelle la ramène au terme du partage.
 */
export const SHARED_LOCATION_RECIPIENT_DEADLINE_MAX_SECONDS = 8 * 60 * 60;

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
  /** Une demande de partage sous Ami (#19204) : la loi ne l'ouvre pas dans cette paire. */
  REQUEST_FORBIDDEN: 'SHARED_LOCATION_REQUEST_FORBIDDEN',
  /** Une demande déjà faite à cette personne dans la fenêtre (#19204). */
  REQUEST_TOO_SOON: 'SHARED_LOCATION_REQUEST_TOO_SOON',
} as const;
export type SharedLocationErrorCode = (typeof SHARED_LOCATION_ERROR_CODES)[keyof typeof SHARED_LOCATION_ERROR_CODES];

/**
 * Ce que `GET /relations/locations?include=` ajoute aux partages en cours (#19202) : le
 * dernier point de chaque Sang qui me l'a consenti, et les partages qui me visaient,
 * terminés depuis moins d'un jour. Sans `include`, la réponse est celle d'avant.
 */
export const SHARED_LOCATION_SNAPSHOT_INCLUDES = ['blood', 'ended'] as const;
export type SharedLocationSnapshotInclude = (typeof SHARED_LOCATION_SNAPSHOT_INCLUDES)[number];
export type SharedLocationSnapshotIncludes = Readonly<Record<SharedLocationSnapshotInclude, boolean>>;

/** Un partage terminé reste dit « terminé il y a… » à ceux qu'il servait, un jour durant. */
export const SHARED_LOCATION_ENDED_WINDOW_HOURS = 24;

/** `include` : une liste séparée par des virgules ; un mot inconnu s'ignore, une valeur illisible n'ajoute rien. */
export function parseSharedLocationIncludes(raw: unknown): SharedLocationSnapshotIncludes {
  const words = typeof raw === 'string' ? raw.split(',').map((word) => word.trim().toLowerCase()) : [];
  return { blood: words.includes('blood'), ended: words.includes('ended') };
}

/** Ce qu'une demande adressée à l'émetteur peut dire (#19204) : prolonger le partage en cours, ou en refaire un après sa fin. */
export const SHARED_LOCATION_REQUEST_KINDS = ['extend', 'reask'] as const;
export type SharedLocationRequestKind = (typeof SHARED_LOCATION_REQUEST_KINDS)[number];

/** Une demande par paire (quel que soit son genre) par fenêtre : on demande, on ne harcèle pas. */
export const SHARED_LOCATION_REQUEST_WINDOW_MINUTES = 30;
