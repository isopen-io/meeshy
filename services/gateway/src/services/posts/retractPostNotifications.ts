import { enhancedLogger } from '../../utils/logger-enhanced';
import type {
  RetractedNotification,
  RetractedNotificationAnnouncer,
} from '../notifications/retractedNotifications';

const log = enhancedLogger.child({ module: 'retractPostNotifications' });

/**
 * Retirer les notifications qu'un post a produites — le jumeau de
 * `retractMessageNotifications`, et ce qui l'en distingue.
 *
 * Même cause : le retrait d'un post est DOUX (`deletedAt`), donc aucune cascade
 * ne se déclenche, et chaque ligne garde la copie dénormalisée qu'elle a prise
 * à sa création (`content`, `metadata.commentPreview`,
 * `metadata.firstAttachmentUrl` — la vignette du média retiré). Aucun filtre à
 * la lecture ne peut les rattraper : la ligne ne relit jamais le post.
 *
 * Même arbitrage : retrait plutôt que neutralisation. Une notification dont le
 * post n'existe plus n'a rien à afficher ET rien où mener — son
 * `action: view_post` n'ouvre qu'un écran 404. C'est aussi le seul geste que
 * les clients savent déjà recevoir (`notification:deleted`, écouté par le web
 * et par le SDK iOS).
 *
 * DEUX différences de forme, et elles décident toute l'implémentation :
 *
 *  1. **Aucune colonne ne porte le lien.** `Notification.messageId` existe ;
 *     rien d'équivalent pour un post. La seule trace est `context.postId`, un
 *     chemin dans un blob JSON que l'API Prisma ne sait pas filtrer sur
 *     MongoDB — d'où la commande brute, exactement comme
 *     `markPostNotificationsAsRead` et `retractFriendRequestNotifications`.
 *     Le filtre n'est PAS scopé à un `userId` : un post notifie une AUDIENCE
 *     (auteur, commentateurs du fil, amis prévenus de la publication), donc la
 *     relecture projette `userId` et l'annonce se groupe par destinataire —
 *     `announceNotificationsRetracted` le fait déjà.
 *  2. **Le lot n'est pas la fin.** L'audience d'un post dépasse la taille d'un
 *     lot bien plus vite que les quelques destinataires d'un message. Une
 *     lecture unique laisserait la queue en base sans le moindre signal,
 *     puisque le premier lot, lui, a réussi. D'où le drainage.
 *
 * La suppression porte sur les ids RELUS et non sur le prédicat : l'ensemble
 * supprimé et l'ensemble annoncé sont alors identiques par construction, et
 * aucune ligne ne peut disparaître sans son `notification:deleted`. La course
 * avec une notification créée pendant le retrait est fermée de l'autre côté,
 * à l'admission : `canNotifyAboutPost` passe par `loadPostAcl`, qui rend `null`
 * pour un post supprimé.
 */

/**
 * Taille d'un lot. Modeste DÉLIBÉRÉMENT : `announceNotificationsRetracted`
 * déclenche un recalcul de compteurs par destinataire distinct, et le lot borne
 * donc la rafale de lectures concurrentes. Les lots s'enchaînent en série, si
 * bien que le pic reste celui d'un seul lot quelle que soit la taille de
 * l'audience.
 */
export const POST_NOTIFICATION_RETRACTION_BATCH_SIZE = 200;

/**
 * Plafond de sécurité du drainage. Il ne borne pas une audience réaliste
 * (40 000 lignes pour un seul post) — il empêche une boucle infinie si la
 * suppression cessait un jour de faire progresser la lecture.
 */
const MAX_RETRACTION_BATCHES = 200;

type RawObjectId = string | { $oid?: string };

type RawNotificationBatch = {
  cursor?: { firstBatch?: ReadonlyArray<{ _id?: RawObjectId; userId?: RawObjectId }> };
};

/**
 * La seule surface Prisma que le retrait touche, énumérée pour qu'un appelant
 * sache exactement ce qu'il autorise.
 */
export interface PostNotificationRetractionPrisma {
  $runCommandRaw(command: Record<string, unknown>): Promise<unknown>;
  notification: {
    deleteMany(args: { where: { id: { in: string[] } } }): Promise<{ count: number }>;
  };
}

/**
 * `_id` et `userId` arrivent en Extended JSON (`{ $oid }`) et non en `string` :
 * c'est la différence entre la commande brute et un `findMany` Prisma, et la
 * raison pour laquelle le retrait relit puis supprime par ids typés plutôt que
 * d'enchaîner deux commandes brutes.
 */
function objectId(raw: RawObjectId | undefined): string | undefined {
  if (typeof raw === 'string') return raw;
  return raw?.$oid;
}

export async function retractPostNotifications(
  prisma: PostNotificationRetractionPrisma,
  postId: string,
  announcer: RetractedNotificationAnnouncer | undefined
): Promise<number> {
  let total = 0;

  for (let batch = 0; batch < MAX_RETRACTION_BATCHES; batch += 1) {
    const raw = (await prisma.$runCommandRaw({
      find: 'Notification',
      filter: { 'context.postId': postId },
      projection: { _id: 1, userId: 1 },
      singleBatch: true,
      batchSize: POST_NOTIFICATION_RETRACTION_BATCH_SIZE,
    })) as RawNotificationBatch;

    const rows = raw?.cursor?.firstBatch ?? [];
    const ids = rows.map((row) => objectId(row._id)).filter((id): id is string => id !== undefined);
    if (ids.length === 0) return total;

    await prisma.notification.deleteMany({ where: { id: { in: ids } } });

    // L'annonce APRÈS l'écriture durable, et jamais l'inverse : les compteurs
    // qu'elle recalcule doivent voir la base d'après le retrait. Une ligne sans
    // `userId` lisible n'est pas annonçable — elle est tout de même supprimée,
    // parce que la laisser ferait boucler la relecture sur elle.
    const retracted = rows
      .map((row) => ({ id: objectId(row._id), userId: objectId(row.userId) }))
      .filter((row): row is RetractedNotification => !!row.id && !!row.userId);
    if (retracted.length > 0) {
      await announcer?.announceNotificationsRetracted(retracted);
    }

    total += ids.length;
    if (rows.length < POST_NOTIFICATION_RETRACTION_BATCH_SIZE) return total;
  }

  log.warn('post notification retraction: batch ceiling reached, rows may remain', {
    postId,
    retracted: total,
  });
  return total;
}
