import { enhancedLogger } from '../../utils/logger-enhanced';
import {
  retractedNotificationOf,
  type RetractedNotificationAnnouncer,
} from '../notifications/retractedNotifications';

const log = enhancedLogger.child({ module: 'retractCommentNotifications' });

/**
 * Retirer les notifications qu'un commentaire a produites — sixième occurrence
 * de la famille ouverte aux cycles 46/47/48/50/51, et la première un cran EN
 * DESSOUS du post.
 *
 * Même cause que ses cinq aînées : le retrait d'un commentaire est DOUX
 * (`PostComment.deletedAt`), donc aucune cascade ne se déclenche ; le lien vers
 * la notification vit dans un blob JSON, donc aucune relation déclarée ne
 * pourrait s'en charger ; et la ligne garde une copie DÉNORMALISÉE du contenu
 * retiré (`content` = l'extrait du commentaire, `metadata.commentPreview`),
 * donc aucun filtre à la lecture ne peut rattraper — la notification ne relit
 * jamais le commentaire.
 *
 * Même arbitrage que le post : RETRAIT, pas neutralisation. Le commentaire est
 * filtré partout à la lecture (`getComments`/`getReplies` excluent
 * `deletedAt`), si bien que le `action: view_post` de la ligne ouvre un fil où
 * la cible n'existe plus. Et seul l'AUTEUR peut retirer son commentaire
 * (`deleteComment` rejette `FORBIDDEN` sinon) : il n'y a donc pas de retrait de
 * modération dont la notification serait la seule trace.
 *
 * DEUX différences avec le jumeau côté post, et elles décident l'implémentation :
 *
 *  1. **Le lien vit dans DEUX chemins JSON, et aucun des deux ne couvre tous
 *     les types.** Huit types de notification naissent d'un commentaire ; ils
 *     se répartissent en trois familles :
 *
 *       - `context.commentId` SEUL : `comment_reaction` ;
 *       - `metadata.commentId` SEUL : `post_comment`, `comment_like` ;
 *       - les deux : `comment_reply`, `user_mentioned` (mention en
 *         commentaire), `story_new_comment`, `story_thread_reply`,
 *         `friend_story_comment`.
 *
 *     Une transposition littérale du retrait de post — qui ne connaît que
 *     `context.<clé>` — laisserait donc en base les « X a commenté votre
 *     publication », c'est-à-dire la notification la plus fréquente de toute
 *     la famille. D'où le `$or` sur les deux chemins. (Uniformiser les huit
 *     producteurs sur `context` serait le correctif de fond ; il change un
 *     contrat lu par les clients, et n'aiderait de toute façon pas les lignes
 *     DÉJÀ écrites.)
 *
 *  2. **La cible est une LISTE.** `deleteComment` soft-delete le sous-arbre
 *     entier — le commentaire et toutes ses réponses, à profondeur arbitraire —
 *     parce que `commentCount` compte le fil complet. Le retrait reçoit donc
 *     exactement la liste d'ids que le soft-delete a écrite ; ne traiter que la
 *     cible laisserait derrière lui les notifications des réponses emportées.
 *
 * `parentCommentId` n'est VOLONTAIREMENT pas dans le filtre. C'est la seule
 * autre clé de `context` qui désigne un commentaire, et elle ne désigne jamais
 * le sujet de la ligne : sur un `comment_reply`, `commentId` est la réponse et
 * `parentCommentId` le commentaire auquel on répond. Le cas où le parent
 * disparaît est déjà couvert — le sous-arbre emporte la réponse, donc la ligne
 * part par son `commentId`.
 *
 * Comme pour le post, la suppression porte sur les ids RELUS et non sur le
 * prédicat : l'ensemble supprimé et l'ensemble annoncé sont alors identiques
 * par construction, et aucune ligne ne peut disparaître sans son
 * `notification:deleted`.
 */

/**
 * Taille d'un lot. Même valeur et même raison que le retrait de post :
 * `announceNotificationsRetracted` déclenche un recalcul de compteurs par
 * destinataire distinct, et le lot borne donc la rafale de lectures
 * concurrentes. Les lots s'enchaînent en série, si bien que le pic reste celui
 * d'un seul lot quelle que soit la taille du fil.
 */
export const COMMENT_NOTIFICATION_RETRACTION_BATCH_SIZE = 200;

/**
 * Plafond de sécurité du drainage. Il ne borne aucun fil réaliste — il empêche
 * une boucle infinie si la suppression cessait un jour de faire progresser la
 * lecture.
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
export interface CommentNotificationRetractionPrisma {
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

export async function retractCommentNotifications(
  prisma: CommentNotificationRetractionPrisma,
  commentIds: readonly string[],
  announcer: RetractedNotificationAnnouncer | undefined
): Promise<number> {
  // Une liste vide n'est pas un `$in: []` à envoyer à Mongo : c'est une
  // question qui n'a pas lieu d'être posée.
  if (commentIds.length === 0) return 0;

  const targets = [...commentIds];
  let total = 0;

  for (let batch = 0; batch < MAX_RETRACTION_BATCHES; batch += 1) {
    const raw = (await prisma.$runCommandRaw({
      find: 'Notification',
      filter: {
        $or: [
          { 'context.commentId': { $in: targets } },
          { 'metadata.commentId': { $in: targets } },
        ],
      },
      // `delivery.pushSent` : la révocation push ne réveille un appareil que
      // là où un push est parti.
      projection: { _id: 1, userId: 1, 'delivery.pushSent': 1 },
      singleBatch: true,
      batchSize: COMMENT_NOTIFICATION_RETRACTION_BATCH_SIZE,
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
    if (rows.length < COMMENT_NOTIFICATION_RETRACTION_BATCH_SIZE) return total;
  }

  log.warn('comment notification retraction: batch ceiling reached, rows may remain', {
    commentIds: targets.length,
    retracted: total,
  });
  return total;
}
