import { z } from 'zod';

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
 */
export const WORLD_CONVERSATION_IDENTIFIER = 'world';

export const WORLD_CONVERSATION_TITLE = 'World Wide';

/** L'identifiant LISIBLE du lien de partage semé — la clé de jonction que la landing suit. */
export const WORLD_SHARE_LINK_IDENTIFIER = 'mshy_world';

/**
 * Ce que `GET /api/v1/world` sert — public, sans identité, mis en cache court.
 *
 * Ce qui ne voyage JAMAIS : un id de conversation, un id d'utilisateur, une
 * liste de participants, la présence de qui que ce soit. L'effectif est un
 * AGRÉGAT, présenté par la même loi que partout ailleurs
 * (`presentMemberCount`, `utils/member-visibility.ts`) : un lecteur anonyme
 * reçoit « 199+ » au-delà du plafond, jamais le chiffre exact.
 *
 * Rendu client : `formatMemberCount(memberCount, memberCountCapped)`.
 */
export const worldEntrySchema = z.object({
  identifier: z.string().min(1),
  title: z.string().min(1),
  shareLinkIdentifier: z.string().min(1),
  memberCount: z.number().int().nonnegative(),
  memberCountCapped: z.literal(true).optional(),
});

export type WorldEntry = z.infer<typeof worldEntrySchema>;
