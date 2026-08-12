/**
 * Effectif ACTIF d'une conversation, compté par la base à chaque lecture.
 *
 * La colonne `Conversation.memberCount` existe dans le schéma Prisma
 * (`@default(0)`) et n'est écrite NULLE PART par le gateway : la seule écriture
 * du dépôt est `migrations/migrate-from-legacy.ts`, qui recopie la valeur du
 * document hérité. Toute conversation créée par le code actuel garde donc `0`
 * à vie, et une conversation migrée garde l'effectif du jour de la migration.
 * La colonne n'est pas « en retard » : elle est morte.
 *
 * `GET /conversations/:id` et `GET /conversations/search` la contournaient déjà
 * en servant ce `_count` filtré ; `GET /conversations` (la LISTE) et l'écran
 * admin lisaient la colonne. Deux réponses portaient le même nom de champ pour
 * deux valeurs différentes — d'où ce fragment unique, à passer en
 * `_count.select` de tout `select`/`include` qui doit rendre `memberCount`.
 *
 * Le fragment vit ici plutôt que dans `core.ts` pour que l'écran admin puisse
 * le partager sans importer un module de routes entier — un import qui traîne
 * ses propres dépendances jusque dans les doubles jest des suites voisines.
 */
export const conversationActiveMemberCountSelect = {
  participants: { where: { isActive: true } }
} as const;
