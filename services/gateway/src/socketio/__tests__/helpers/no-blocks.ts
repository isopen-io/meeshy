/**
 * LA SURFACE QU'UN DOUBLE PRISMA DOIT PORTER POUR UN MONDE SANS BLOCAGE (#16745).
 *
 * `getBlockRelatedUserIds` (`utils/blocking.ts`) lit DEUX colonnes de `User` en
 * parallèle : qui a bloqué le sujet (`findMany`) et qui le sujet a bloqué
 * (`findUnique`). Un double qui n'expose pas `prisma.user` ne rend donc pas
 * « aucun blocage » — il lève un `TypeError`, que le `try` du handler traduit
 * en refus. Une suite qui parle d'autre chose en sortirait rouge sans que son
 * sujet ait changé.
 *
 * Une fabrique, et non sept copies : un double dont la forme est retapée à
 * chaque site est un double qu'un site finira par ne pas avoir, et la perte est
 * silencieuse dans les deux sens (§ « Un double PARTIEL d'un module perd en
 * silence tout ce que le module GAGNE »).
 *
 * Pour un monde AVEC blocages, ne pas l'étendre : écrire la fixture qui lit une
 * carte `blockedUserIds`, comme le fait `LocationHandler.blocking.test.ts`.
 */
export const noBlocksUserSurface = () => ({
  findMany: async () => [] as Array<{ id: string }>,
  findUnique: async () => ({ blockedUserIds: [] as string[] }),
});
