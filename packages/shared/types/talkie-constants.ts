/**
 * LES CONSTANTES DU TALKIE (#13935) — bornes, encodages, codes de refus et raisons
 * de fin. Elles vivent HORS de `./talkie.ts` pour qu'un client léger (le web,
 * #16638) les lise sans embarquer Zod : `./talkie.ts` les répand, rien ne change
 * pour ses lecteurs.
 */

/** Une prise de parole dure au plus 30 s, comme la copie vocale qui la double. */
export const TALKIE_MAX_DURATION_MS = 30_000;
/** Un fragment de ~500 ms en AAC mono 64 kb/s pèse ~4 Ko : 16 Ko laissent de la marge sans ouvrir un tuyau. */
export const TALKIE_MAX_CHUNK_BYTES = 16_384;
/** Plafond d'une prise de parole entière : 30 s à 64 kb/s ≈ 240 Ko, doublés. */
export const TALKIE_MAX_TOTAL_BYTES = 512_000;
/** Plafond du NOMBRE de fragments d'une prise de parole : 30 s par fragments de 100 ms au plus court. */
export const TALKIE_MAX_CHUNKS = 300;
/** Le seul encodage relayé au MVP : celui du vocal (AAC mono, trames ADTS lisibles dès la première). */
export const TALKIE_CODECS = ['aac-adts'] as const;
export type TalkieCodec = (typeof TALKIE_CODECS)[number];

/**
 * `live` : le destinataire a une socket, la voix sort chez lui en direct.
 * `waking` (#17142) : il n'en a pas mais il est joignable par push — un réveil part, la voix est gardée en mémoire et
 * rejouée dans l'ordre quand il émet `talkie:join`, puis le direct continue.
 */
export const TALKIE_DELIVERIES = ['live', 'waking'] as const;
export type TalkieDelivery = (typeof TALKIE_DELIVERIES)[number];

/** Après la fin d'une prise de parole réveillée, le destinataire a encore 60 s pour la rejoindre et l'entendre. */
export const TALKIE_JOIN_WINDOW_MS = 60_000;

/** Le type (`data.type`) du push de réveil, sur les deux canaux (PushToTalk et notification haute priorité). */
export const TALKIE_PUSH_TYPES = { INCOMING: 'talkie_incoming' } as const;

/**
 * Le repli n'est pas une erreur (précision du porteur, #17141) : l'émetteur lit une INFORMATION. La copie vocale est
 * créée par le CLIENT émetteur, dans la conversation la plus récente avec ce destinataire (`conversationId` de l'accusé).
 */
export const TALKIE_FALLBACK_VOICE_MESSAGE =
  'L’utilisateur n’est pas disponible pour un accès d’urgence. Un message sera créé et envoyé dans votre conversation la plus récente avec lui.';

export const TALKIE_ERROR_CODES = {
  /** Pas de lien d'au moins Proche, blocage, compte inconnu ou désactivé — indistincts. */
  NOT_ALLOWED: 'TALKIE_NOT_ALLOWED',
  /** Le destinataire a coupé la réception directe (pour moi ou pour tous). */
  BLOCKED: 'TALKIE_BLOCKED',
  /** La conversation directe de la paire est chiffrée de bout en bout : aucun clair ne passe (E10). */
  E2EE_CONVERSATION: 'TALKIE_E2EE_CONVERSATION',
  /**
   * Envoyer un message vocal à la place : le destinataire est en appel, en Ne pas déranger, sans
   * appareil connecté — ou sa présence n'est pas servie à l'émetteur (masquée), auquel cas c'est le
   * même code quel que soit son état. Le client affiche un libellé NEUTRE, sans en dire la raison.
   */
  FALLBACK_VOICE: 'TALKIE_FALLBACK_VOICE',
  /** Trop de prises de parole, ou un débit hors des bornes. */
  RATE_LIMITED: 'TALKIE_RATE_LIMITED',
  /** Charge illisible (identifiant, encodage, fragment trop gros, ordre). */
  INVALID: 'TALKIE_INVALID',
  /** La prise de parole n'existe pas (finie, coupée) ou n'est pas la mienne. */
  NOT_FOUND: 'TALKIE_NOT_FOUND',
  /** Le serveur ne peut pas juger (lecture en panne) : rien ne passe. */
  UNAVAILABLE: 'TALKIE_UNAVAILABLE',
} as const;
export type TalkieErrorCode = (typeof TALKIE_ERROR_CODES)[keyof typeof TALKIE_ERROR_CODES];

/** `sender` : bouton relâché · `limit` : 30 s ou plafond atteint · `cut` : coupée (blocage, réglage, déconnexion). */
export const TALKIE_END_REASONS = ['sender', 'limit', 'cut'] as const;
export type TalkieEndReason = (typeof TALKIE_END_REASONS)[number];
