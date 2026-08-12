/**
 * Marqueur d'écriture du soft-delete d'un `Message` — jumeau de `NOT_DELETED`
 * (`services/posts/softDelete.ts`), qui n'en couvre que la LECTURE.
 *
 * Les deux modèles ont résolu le même piège MongoDB par deux moitiés
 * différentes, et c'est cette asymétrie qu'il faut avoir en tête avant de
 * toucher à l'un ou à l'autre :
 *
 * - `Post` a choisi le côté LECTURE. Un post vivant n'a pas de colonne
 *   `deletedAt` du tout, et toutes ses requêtes apparient l'ABSENCE
 *   (`{ isSet: false }`). Le filtre naïf `deletedAt: null` n'apparie que le
 *   présent-et-null : appliqué à ce modèle il ne rend AUCUN post vivant, ce
 *   qui a vidé feed / reels / stories en production (post-mortem en tête de
 *   `services/posts/postIncludes.ts`).
 * - `Message` a choisi le côté ÉCRITURE. Ses ~119 lectures — aperçu de
 *   conversation, compte de non-lus, delta `/sync`, admission d'édition et de
 *   suppression, statistiques — filtrent toutes `deletedAt: null`, et c'est
 *   CHAQUE créateur qui rend ce filtre vrai en écrivant la colonne à `null`.
 *
 * La convention côté message n'était portée par aucun nom : sept `create`
 * répartis dans six fichiers répétaient le littéral, et deux d'entre eux
 * (les messages d'appel de `CallService`) l'avaient perdu — leurs lignes
 * n'étaient donc appariées par aucune de ces lectures. La constante existe
 * pour que l'invariant ait un endroit où être écrit, une fois, et un nom à
 * chercher avant d'ajouter un huitième créateur.
 *
 * À ne PAS confondre avec un défaut de schéma : `deletedAt` reste
 * `DateTime?`. Ce qui est écrit ici est l'état VIVANT explicite, pas une
 * valeur par défaut que Prisma poserait tout seul — il ne le fait pas.
 */
export const LIVE_MESSAGE_MARK = { deletedAt: null } as const;
