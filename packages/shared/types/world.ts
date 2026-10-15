import * as z from 'zod/mini';

export * from './world-identity.js';

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
 *
 * `memberCount` est OPTIONNEL (#10205, directive porteur du 2026-10-11 : un
 * visiteur sans compte ne voit pas le nombre de participants) : la passerelle
 * peut cesser de le servir sur cette route publique sans casser la landing ni
 * l'entrée `/world`, qui ne le montrent plus à un non-membre.
 *
 * Écrit en `zod/mini` (#10038) : le web le lit tel quel, sans jumelle, et sans
 * faire entrer `zod` complet dans le chunk de son écran.
 */
export const worldEntrySchema = z.object({
  identifier: z.string().check(z.minLength(1)),
  title: z.string().check(z.minLength(1)),
  shareLinkIdentifier: z.string().check(z.minLength(1)),
  memberCount: z.optional(z.number().check(z.int(), z.nonnegative())),
  memberCountCapped: z.optional(z.literal(true)),
  /** Avatar et bannière de World Wide (#10204), adresses absolues — absents tant que la conversation n'en porte pas. */
  avatar: z.optional(z.string().check(z.minLength(1))),
  banner: z.optional(z.string().check(z.minLength(1))),
});

export type WorldEntry = z.infer<typeof worldEntrySchema>;
