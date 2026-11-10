/**
 * LA CONVERSATION EXTERNE (#17117, chantier #17007) : un tête-à-tête entre un
 * utilisateur Meeshy et un ami d'un réseau tiers (WhatsApp, au titre de
 * l'article 7 du règlement (UE) 2022/1925), TOUJOURS chiffré de bout en bout.
 *
 * Design : `docs/superpowers/specs/2026-11-08-dma-whatsapp-interop-design.md`
 * § 2 et § 4. Décision :
 * `services/gateway/decisions/2026-11-10-une-conversation-externe-nait-chiffree-de-bout-en-bout-et-adressee-par-numero.md`.
 *
 * Ce fichier porte ce qui VOYAGE : le nom du type, le jeton de capacité qu'un
 * client annonce pour le recevoir (#9223 — un ancien client ne le reçoit pas),
 * et les codes stables des refus.
 */

/** La valeur de `Conversation.type` d'une conversation avec un ami d'un réseau tiers. */
export const EXTERNAL_CONVERSATION_TYPE = 'external' as const;

/**
 * Le jeton `X-Meeshy-Capabilities` d'un client qui sait lire une conversation
 * externe. Sans lui, la liste ne la sert pas : un client publié avant ce type
 * ne reçoit rien qu'il ne sache dire.
 */
export const EXTERNAL_CONVERSATIONS_CAPABILITY = 'external-conversations' as const;

/** Les codes stables d'un refus d'ouverture, posés en `code` à côté d'`error`. */
export const EXTERNAL_CONVERSATION_ERROR_CODES = {
  /** Le drapeau serveur est éteint (toujours en production avant la signature avec Meta). */
  DISABLED: 'EXTERNAL_CONVERSATIONS_DISABLED',
  /** Écrire à un réseau tiers exige un numéro VÉRIFIÉ côté Meeshy (décision porteur du 2026-11-08). */
  PHONE_UNVERIFIED: 'EXTERNAL_CONVERSATION_PHONE_UNVERIFIED',
  /** La demande ne respecte pas le contrat (réseau inconnu, numéro hors E.164, champ en trop). */
  INVALID: 'EXTERNAL_CONVERSATION_INVALID',
} as const;

export type ExternalConversationErrorCode =
  (typeof EXTERNAL_CONVERSATION_ERROR_CODES)[keyof typeof EXTERNAL_CONVERSATION_ERROR_CODES];

/**
 * La durée de conservation PROVISOIRE du numéro de l'ami, en jours, comptée
 * depuis la dernière ouverture par l'utilisateur. Exception bornée à #9225 :
 * la durée définitive et sa base légale sont fixées par le lot conformité
 * (#16999), qui remplace cette valeur. Elle ne dépasse jamais
 * `EXTERNAL_PEER_HANDLE_RETENTION_MAX_DAYS`.
 */
export const EXTERNAL_PEER_HANDLE_RETENTION_DAYS = 90;

/** La borne qu'aucune durée de conservation du numéro ne franchit, quelle que soit la décision à venir. */
export const EXTERNAL_PEER_HANDLE_RETENTION_MAX_DAYS = 365;
