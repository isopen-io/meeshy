import { enhancedLogger } from '../../utils/logger-enhanced';
import {
  retractedNotificationOf,
  type RetractedNotificationAnnouncer,
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
 * L'entrée est une LISTE, comme celle du jumeau `retractCommentNotifications`.
 * Le retrait interactif n'en passe qu'un ; le balayage des stories expirées —
 * seul chemin de hard-delete de post du gateway — en détruit une fournée d'un
 * coup (stories du jour ∪ leurs reposts), et ce qui part ensemble se retire
 * ensemble : un `$in` là où un retrait post par post ferait autant de lectures
 * que de posts.
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
 *
 * Atteint, il REJETTE. Tant que l'entrée était un post unique, un
 * avertissement suffisait : le plafond n'était pas atteignable. Le balayage
 * des stories expirées, lui, entre une heure d'expirations de toute la
 * plateforme — un ensemble que rien ne borne. Or il retire AVANT de détruire,
 * précisément pour pouvoir renoncer : un plafond atteint en silence le
 * laisserait détruire les posts, et les lignes restantes n'auraient alors plus
 * aucun chemin de retrait, puisque la passe suivante ne verra plus les posts.
 * Le rejet rend la reprise possible, et elle converge — les lots déjà lus ont
 * bien été supprimés.
 */
const MAX_RETRACTION_BATCHES = 200;

type RawObjectId = string | { $oid?: string };

type RawNotificationRow = {
  _id?: RawObjectId;
  userId?: RawObjectId;
  delivery?: { pushSent?: unknown };
};

type RawNotificationBatch = {
  cursor?: { firstBatch?: ReadonlyArray<RawNotificationRow> };
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
  postIds: readonly string[],
  announcer: RetractedNotificationAnnouncer | undefined
): Promise<number> {
  // Une liste vide n'est pas un `$in: []` à envoyer à Mongo : c'est une
  // question qui n'a pas lieu d'être posée. Le balayage horaire tombe sur ce
  // cas à chaque passe où rien n'a expiré, c'est-à-dire la plupart du temps.
  if (postIds.length === 0) return 0;

  const targets = [...postIds];
  let total = 0;

  for (let batch = 0; batch < MAX_RETRACTION_BATCHES; batch += 1) {
    const raw = (await prisma.$runCommandRaw({
      find: 'Notification',
      // Deux chemins, parce qu'une ligne `post_repost` nomme le post sous DEUX
      // clés : `context.postId` porte l'ORIGINAL (c'est lui qu'elle ouvre) et
      // `metadata.repostId` le repost qui l'a produite. Supprimer le repost
      // doit la retirer, et seul le second chemin le sait — le premier la
      // laissait en base, annonçant un repost qui n'existe plus.
      filter: {
        $or: [
          { 'context.postId': { $in: targets } },
          { 'metadata.repostId': { $in: targets } },
        ],
      },
      // `delivery.pushSent` : la révocation push ne réveille un appareil que
      // là où un push est parti. Aucune conversation ici — les lignes d'un post
      // n'en portent pas.
      projection: { _id: 1, userId: 1, 'delivery.pushSent': 1 },
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
    const retracted = rows.flatMap((row) => {
      const id = objectId(row._id);
      const userId = objectId(row.userId);
      return id && userId ? [retractedNotificationOf({ id, userId, delivery: row.delivery })] : [];
    });
    if (retracted.length > 0) {
      await announcer?.announceNotificationsRetracted(retracted);
    }

    total += ids.length;
    if (rows.length < POST_NOTIFICATION_RETRACTION_BATCH_SIZE) return total;
  }

  log.warn('post notification retraction: batch ceiling reached, rows remain', {
    posts: targets.length,
    retracted: total,
  });
  throw new Error(
    `post notification retraction: drainage inachevé après ${MAX_RETRACTION_BATCHES} lots (${total} lignes retirées)`
  );
}
