/**
 * LES CONSTANTES DE LA SÉANCE « ENSEMBLE » (#17011, #17012) — bornes, codes de refus
 * et raisons de fin. Elles vivent HORS de `./together.ts` pour qu'un client léger (le
 * web) les lise sans embarquer Zod : `./together.ts` les répand.
 */

/** Une invitation non acceptée s'éteint au bout de 2 minutes. */
export const TOGETHER_INVITE_TTL_SECONDS = 120;
/** Une séance rejointe dure au plus 4 heures, prolongée à chaque synchronisation. */
export const TOGETHER_SESSION_TTL_SECONDS = 4 * 60 * 60;
/** Une position de lecture au-delà de 24 h n'est pas un média de conversation. */
export const TOGETHER_MAX_POSITION_MS = 24 * 60 * 60 * 1000;

/** Le média lu ensemble : une pièce jointe audio ou vidéo de la conversation. */
export const TOGETHER_MEDIA_KINDS = ['audio', 'video'] as const;
export type TogetherMediaKind = (typeof TOGETHER_MEDIA_KINDS)[number];

export const TOGETHER_ERROR_CODES = {
  /**
   * Pas de lien d'au moins Proche, blocage, compte inconnu ou désactivé, conversation non
   * partagée, média absent, protégé ou d'un autre type — indistincts.
   */
  NOT_ALLOWED: 'TOGETHER_NOT_ALLOWED',
  /** Charge illisible (identifiant, position, état). */
  INVALID: 'TOGETHER_INVALID',
  /** La séance n'existe pas (finie, expirée, coupée) ou n'est pas la mienne — une coupure rend ce code, jamais un autre. */
  NOT_FOUND: 'TOGETHER_NOT_FOUND',
  /** Trop d'invitations ou de synchronisations. */
  RATE_LIMITED: 'TOGETHER_RATE_LIMITED',
  /** Le serveur ne peut pas juger (lecture en panne) : rien ne s'ouvre. */
  UNAVAILABLE: 'TOGETHER_UNAVAILABLE',
} as const;
export type TogetherErrorCode = (typeof TOGETHER_ERROR_CODES)[keyof typeof TOGETHER_ERROR_CODES];

/**
 * `left` : l'un a quitté — ou la séance a été coupée (blocage, baisse sous Proche, départ de
 * la conversation, média devenu protégé), dite comme un départ pour que celui qu'on a bloqué
 * n'en apprenne pas davantage · `declined` : l'invité a refusé avant de rejoindre ·
 * `replaced` : une nouvelle invitation de la paire remplace celle-ci.
 */
export const TOGETHER_END_REASONS = ['left', 'declined', 'replaced'] as const;
export type TogetherEndReason = (typeof TOGETHER_END_REASONS)[number];
