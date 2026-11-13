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
  /**
   * Le compte ne peut pas encore choisir le bout en bout (`mayChooseEndToEnd`,
   * phase de test) : une conversation externe ne naît qu'en `e2ee`.
   */
  END_TO_END_RESERVED: 'EXTERNAL_CONVERSATION_END_TO_END_RESERVED',
  /** Le compte garde déjà `EXTERNAL_CONVERSATION_ACTIVE_CAP` adresses d'amis : une ouverture NEUVE est refusée. */
  LIMIT_REACHED: 'EXTERNAL_CONVERSATION_LIMIT_REACHED',
  /**
   * Une conversation externe n'a qu'un membre Meeshy, son ouvreur : aucune porte
   * (ajout, invitation, lien, jonction par lien) n'y fait entrer quelqu'un. Un
   * second membre écrirait sous l'identité téléphonique de l'ouvreur.
   */
  SINGLE_MEMBER: 'EXTERNAL_CONVERSATION_SINGLE_MEMBER',
  /**
   * #17120 — aucun consentement enregistré sous la version EN VIGUEUR de
   * l'information sur ce qui part chez Meta : le client la montre, recueille le
   * consentement (`PUT /conversations/external/consent`), puis rouvre.
   */
  CONSENT_REQUIRED: 'EXTERNAL_CONVERSATION_CONSENT_REQUIRED',
  /** #17120 — le consentement cite une version de l'information qui n'est plus en vigueur. */
  NOTICE_OUTDATED: 'EXTERNAL_CONVERSATION_NOTICE_OUTDATED',
} as const;

export type ExternalConversationErrorCode =
  (typeof EXTERNAL_CONVERSATION_ERROR_CODES)[keyof typeof EXTERNAL_CONVERSATION_ERROR_CODES];

/**
 * La durée de conservation PAR DÉFAUT du numéro de l'ami, en jours, comptée
 * depuis la dernière ouverture par l'utilisateur. Exception bornée à #9225.
 * La passerelle la lit d'UNE configuration (`EXTERNAL_PEER_HANDLE_RETENTION_DAYS`,
 * #17120, `services/external-conversation/peer-retention.ts`) ; cette valeur
 * PROVISOIRE et prudente s'applique quand rien n'est posé. La durée définitive
 * et sa base légale restent au juriste (#16999). Elle ne dépasse jamais
 * `EXTERNAL_PEER_HANDLE_RETENTION_MAX_DAYS`.
 */
export const EXTERNAL_PEER_HANDLE_RETENTION_DAYS = 90;

/** La borne qu'aucune durée de conservation du numéro ne franchit, quelle que soit la décision à venir. */
export const EXTERNAL_PEER_HANDLE_RETENTION_MAX_DAYS = 365;

/**
 * Le nombre d'adresses d'amis qu'un compte peut garder à la fois (une par
 * conversation externe ouverte et vivante). Fermer une conversation efface
 * son adresse et libère une place.
 */
export const EXTERNAL_CONVERSATION_ACTIVE_CAP = 50;

/** Les ouvertures (neuves ou non) qu'un compte peut demander par heure. */
export const EXTERNAL_CONVERSATION_OPENINGS_PER_HOUR = 20;

/**
 * LA loi « un seul membre Meeshy » : une conversation de ce type admet-elle
 * qu'on y fasse entrer quelqu'un d'autre que son ouvreur ? Consultée par toute
 * porte d'entrée (balayage `external-conversation-doors-sweep.test.ts`).
 */
/** Le message lisible d'un refus `SINGLE_MEMBER`, le même à chaque porte. */
export const EXTERNAL_SINGLE_MEMBER_MESSAGE = 'Nobody else can join a conversation with a friend on another network';

export function conversationAdmitsNewMembers(type: string | null | undefined): boolean {
  return type !== EXTERNAL_CONVERSATION_TYPE;
}
