import { z } from 'zod';

import { GlobalUserRole, globalRoleLevel } from './role-types.js';

/**
 * LA FICHE D'UN PARTICIPANT DE WORLD WIDE (#10102, décision porteur du
 * 2026-10-11) — ce que l'ÉQUIPE lit d'une personne entrée dans World Wide,
 * invité sans compte compris, pour MODÉRER : sous quel nom elle parle, dans
 * quelle langue, depuis quel pays, avec quel navigateur et quel appareil,
 * depuis quand et par quel lien.
 *
 * Qui la lit : un compte dont le rôle global est AU-DELÀ de `USER` (ANALYST,
 * AUDIT, MODERATOR, ADMIN, BIGBOSS — `GLOBAL_ROLE_HIERARCHY`). Personne
 * d'autre : ni un `USER`, ni un `AGENT`, ni un invité. Un rôle inconnu vaut 0
 * (`globalRoleLevel`, la lecture qui échoue FERMÉ) : il ne lit rien.
 *
 * Ce que la fiche dit d'un COMPTE obéit à une SECONDE loi, la hiérarchie : son
 * rôle global, les quatre rangs de son Prisme, et ce qui vient de sa session
 * (poste, pays à défaut de pays d'arrivée) ne sortent que pour un lecteur qui
 * le SURCLASSE strictement, ou pour lui-même — la règle de `requireHierarchy`
 * (`PermissionsService.canManageUser`), qui garde déjà les sessions d'un compte
 * dans l'administration (audit L2-7 : « un ADMIN ne lit pas celles d'un
 * BIGBOSS »). Sinon ces champs sont `null` et `accountDetailsWithheld` le dit.
 * Un rôle cible qui ne se compare pas (inconnu) est retenu, même pour BIGBOSS.
 *
 * Ce qui n'y figure JAMAIS (minimisation) : une adresse IP (le pays suffit), la
 * ville, le jeton ou l'empreinte de session, l'e-mail, le téléphone, la date de
 * naissance, la chaîne User-Agent brute, et la PRÉSENCE (`isOnline`,
 * `lastActiveAt`), qui garde sa propre loi — amis acceptés, soi, ADMIN/BIGBOSS
 * (`resolvePresenceVisibility`), qu'un ANALYST ne franchit pas.
 *
 * Adresse : `GET /api/v1/world/participants/:participantId` — `participantId`
 * est le `Participant.id` que porte déjà chaque message (`senderId`). Le
 * chemin se compose par le catalogue généré, jamais à la main :
 * `participantsByParticipantId` (`@meeshy/shared/api/endpoints/world`).
 */

/** Le rang à partir duquel la fiche s'ouvre : le premier au-delà de `USER`. */
export const WORLD_PARTICIPANT_CARD_MIN_ROLE = GlobalUserRole.ANALYST;

/**
 * La loi d'accès, une seule fois pour la passerelle et pour les clients : le
 * client s'en sert pour rendre un auteur touchable ou non, la passerelle pour
 * refuser. `null` / `undefined` (invité, non connecté) ⇒ non.
 */
export function mayReadWorldParticipantCard(role: string | null | undefined): boolean {
  if (typeof role !== 'string' || role.length === 0) return false;
  return globalRoleLevel(role) > globalRoleLevel(GlobalUserRole.USER);
}

/**
 * Le poste d'où la personne écrit, RÉDUIT : un nom et une version MAJEURE, pour
 * le navigateur et pour le système, et la famille d'appareil. Jamais la chaîne
 * User-Agent, jamais le modèle exact ni le fabricant — assez pour reconnaître
 * « Safari 17 sur iOS 17, mobile », pas assez pour suivre quelqu'un d'une
 * conversation à l'autre.
 */
export const worldParticipantClientSchema = z.object({
  browser: z.string().nullable(),
  browserVersion: z.string().nullable(),
  os: z.string().nullable(),
  osVersion: z.string().nullable(),
  deviceType: z.string().nullable(),
  /** Ce que l'application DÉCLARE d'elle-même (`X-Meeshy-Platform`) — comptes seulement. */
  platform: z.string().nullable(),
  /** Version de l'application déclarée (`X-Meeshy-Version`) — comptes seulement. */
  appVersion: z.string().nullable(),
});

export type WorldParticipantClient = z.infer<typeof worldParticipantClientSchema>;

/**
 * Les langues de la personne. `conversation` est celle sous laquelle elle est
 * entrée (`Participant.language`, la langue de session d'un invité) ; les
 * quatre autres sont les rangs du Prisme d'un COMPTE (`resolveUserLanguage`),
 * `null` pour un invité, qui n'en a pas.
 */
export const worldParticipantLanguagesSchema = z.object({
  conversation: z.string(),
  system: z.string().nullable(),
  regional: z.string().nullable(),
  customDestination: z.string().nullable(),
  deviceLocale: z.string().nullable(),
});

/** Le lien de partage par lequel la personne est entrée — `null` : ajoutée hors lien. */
export const worldParticipantShareLinkSchema = z.object({
  identifier: z.string().nullable(),
  linkId: z.string(),
  name: z.string().nullable(),
});

export const worldParticipantCardSchema = z.object({
  participantId: z.string().min(1),
  /** `anonymous` : invité sans compte ; `user` : compte Meeshy ; `bot` : agent. */
  participantType: z.enum(['anonymous', 'user', 'bot']),
  displayName: z.string(),
  username: z.string().nullable(),
  /** Le rang DANS la conversation : `creator` · `admin` · `moderator` · `member`. */
  conversationRole: z.string(),
  /** Le rôle GLOBAL du compte — `null` pour un invité, ou retenu (`accountDetailsWithheld`). */
  accountRole: z.string().nullable(),
  languages: worldParticipantLanguagesSchema,
  /**
   * ISO 3166-1 alpha-2. Le pays d'ARRIVÉE par le lien (`Participant.joinCountry`),
   * à défaut, pour un compte, celui de sa session la plus récente.
   */
  country: z.string().nullable(),
  /** `null` : rien n'a été relevé (invité entré avant le relevé, compte sans session). */
  client: worldParticipantClientSchema.nullable(),
  joinedAt: z.string(),
  shareLink: worldParticipantShareLinkSchema.nullable(),
  /** `active` : présent ; `left` : a quitté ; `banned` : banni de la conversation. */
  status: z.enum(['active', 'left', 'banned']),
  /**
   * `true` : le compte lu n'est pas SURCLASSÉ par le lecteur — `accountRole`,
   * les quatre rangs du Prisme de `languages`, `client` et le pays de session
   * sont `null` parce qu'ils sont RETENUS, pas parce que rien n'a été relevé.
   * Toujours `false` pour un invité, qui n'a pas de compte.
   */
  accountDetailsWithheld: z.boolean(),
});

export type WorldParticipantCard = z.infer<typeof worldParticipantCardSchema>;

/** Les codes d'erreur que la porte rend, en plus de `AUTH_REQUIRED` / `AUTH_FAILED` (401). */
export const WORLD_PARTICIPANT_CARD_ERRORS = {
  /** 403 — lecteur invité, `USER`, `AGENT` ou rôle inconnu. Rien n'est lu avant ce refus. */
  forbidden: 'WORLD_PARTICIPANT_CARD_FORBIDDEN',
  /** 404 — pas de World Wide, ou ce participant n'appartient pas à World Wide. */
  notFound: 'WORLD_PARTICIPANT_NOT_FOUND',
  /** 503 — la trace d'audit de la lecture n'a pas pu s'écrire : rien n'est servi. */
  auditUnavailable: 'WORLD_PARTICIPANT_CARD_AUDIT_UNAVAILABLE',
} as const;
