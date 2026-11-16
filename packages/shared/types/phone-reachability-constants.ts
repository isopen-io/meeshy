/**
 * LES CONSTANTES DU TÉLÉPHONE INJOIGNABLE (#18737, TEL-01) — causes, annonces, canaux,
 * configuration et types de push. Hors de `./phone-reachability.ts` pour qu'un client léger
 * (le web) les lise sans Zod. Catalogue : `docs/specs/cercles/etat-du-telephone.md`.
 */

/**
 * La cause PROBABLE, déduite par le serveur : `battery` quand le dernier épisode de batterie
 * connu était critique ou éteint, `network` sinon (sans réseau ou en mode avion — le serveur ne
 * peut pas les distinguer, l'interface dit les deux). `unknown` n'est jamais émis : c'est ce
 * qu'un client lit d'une cause ajoutée après lui.
 */
export const PHONE_UNREACHABLE_CAUSES = ['battery', 'network'] as const;
export type PhoneUnreachableCause = (typeof PHONE_UNREACHABLE_CAUSES)[number];
export type PhoneUnreachableServedCause = PhoneUnreachableCause | 'unknown';

/** Ce qu'un pas ANNONCE — jamais un message de conversation : SyncPill (socket) ou push. */
export const PHONE_REACHABILITY_ANNOUNCEMENT_KINDS = ['unreachable', 'reachable'] as const;
export type PhoneReachabilityAnnouncementKind = (typeof PHONE_REACHABILITY_ANNOUNCEMENT_KINDS)[number];

/** Comment une annonce atteint UN lecteur : SyncPill (socket), push dédié, ou rien. */
export type PhoneReachabilityReaderChannel = 'socket' | 'push' | 'none';

export type PhoneReachabilityConfig = {
  /** Sans signe de vie du téléphone depuis ce délai, la première sonde part. */
  readonly quietMinutes: number;
  /** Une sonde sans réponse dans ce délai : la suivante part, ou le téléphone est injoignable. */
  readonly probeTimeoutMinutes: number;
  /** Deux sondes sans réponse font un téléphone injoignable (« deux push non distribués »). */
  readonly probesBeforeUnreachable: number;
  /**
   * Une sonde à laquelle le téléphone a RÉPONDU espace la suivante de ce délai : iOS bride les
   * pushs silencieux, un téléphone sondé toutes les dix minutes finirait par ne plus répondre.
   */
  readonly reprobeAfterMinutes: number;
  /** Durée de vie de l'état en Redis : aucun historique au-delà. */
  readonly stateTtlSeconds: number;
};

export const PHONE_REACHABILITY_CONFIG: PhoneReachabilityConfig = {
  quietMinutes: 10,
  probeTimeoutMinutes: 10,
  probesBeforeUnreachable: 2,
  reprobeAfterMinutes: 60,
  stateTtlSeconds: 259_200,
};

/** Le type de notification des annonces poussées hors conversation. */
export const PHONE_REACHABILITY_NOTIFICATION_TYPE = 'device_unreachable' as const;

/** Le `data.type` du push SILENCIEUX qui sonde le téléphone : il répond par `POST /me/device/alive`. */
export const PHONE_PROBE_PUSH_TYPE = 'device_probe' as const;

export const PHONE_REACHABILITY_ERROR_CODES = {
  /** Le serveur ne peut pas ranger l'état : rien ne part. */
  UNAVAILABLE: 'PHONE_REACHABILITY_UNAVAILABLE',
  /** Charge de réglage illisible. */
  INVALID: 'PHONE_REACHABILITY_INVALID',
} as const;
export type PhoneReachabilityErrorCode = (typeof PHONE_REACHABILITY_ERROR_CODES)[keyof typeof PHONE_REACHABILITY_ERROR_CODES];
