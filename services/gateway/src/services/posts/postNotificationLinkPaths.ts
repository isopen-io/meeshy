/**
 * Les chemins qui lient une notification à une publication. Chacun est INDEXÉ
 * par `packages/shared/prisma/migrations/2026-11-01-notification-post-link-indexes.mongodb.js`
 * (#14254) : sans index, chaque lot parcourait toute la collection. Un chemin
 * ajouté ici sans son index rougit le témoin de cette migration.
 *
 * Module sans dépendance : le retrait d'un post (`retractPostNotifications`) et
 * celui du contenu d'un bloqueur (`blockerContentMatch`, #19220) le partagent.
 */
export const POST_NOTIFICATION_LINK_PATHS = ['context.postId', 'metadata.repostId', 'metadata.originalPostId'] as const;
