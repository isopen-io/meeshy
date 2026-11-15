import type { GuestAttachmentKind } from './guest-attachment-kind-rules.js';

/**
 * WORLD WIDE (#10000) — la conversation dans laquelle le monde entier entre
 * depuis meeshy.me, et ce qu'une landing doit savoir pour y faire entrer
 * quelqu'un.
 *
 * Elle est DISTINCTE de « Meeshy Global » (`identifier: 'meeshy'`), qui reste
 * inchangée : `meeshy` est le salon des INSCRITS, où chaque compte est ajouté à
 * l'inscription ; `world` est la porte d'entrée PUBLIQUE, où un invité sans
 * compte entre par un lien de partage stable.
 *
 * Les deux identifiants sont l'affaire du SERVEUR : il les sème au démarrage
 * (`services/gateway/src/services/world/worldConversation.ts`) et les SERT par
 * `GET /api/v1/world`. Un client ne les écrit jamais en dur — il lit l'entrée,
 * ce qui permet de changer de lien (révocation, rotation) sans republier
 * d'application.
 *
 * Ce module ne charge AUCUN schéma (#10038) : un client qui n'a besoin que
 * d'un identifiant ne paie pas `zod`. `world.ts` le réexporte et porte le
 * schéma de `GET /api/v1/world`.
 */
export const WORLD_CONVERSATION_IDENTIFIER = 'world';

export const WORLD_CONVERSATION_TITLE = 'World Wide';

/** L'identifiant LISIBLE du lien de partage semé — la clé de jonction que la landing suit. */
export const WORLD_SHARE_LINK_IDENTIFIER = 'mshy_world';

/**
 * Ce qu'un INVITÉ de World Wide peut joindre (#10001, décision porteur du
 * 2026-10-10) : du texte `.txt` et de l'audio, rien d'autre. C'est un PLAFOND
 * posé sur la conversation (#10029) : le lien ne peut que le resserrer, et un
 * lien qui ne dit rien n'ouvre pas davantage. Les comptes ne sont pas concernés.
 */
export const WORLD_GUEST_ATTACHMENT_KINDS: readonly GuestAttachmentKind[] = ['text', 'audio'];

/** Les plafonds de familles décidés sur une conversation, par identifiant. */
export const GUEST_ATTACHMENT_KIND_CEILINGS: Readonly<Record<string, readonly GuestAttachmentKind[]>> = {
  [WORLD_CONVERSATION_IDENTIFIER]: WORLD_GUEST_ATTACHMENT_KINDS,
};
