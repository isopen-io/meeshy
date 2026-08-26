import {
  retractedNotificationOf,
  type RetractedNotificationAnnouncer,
} from './retractedNotifications';

/**
 * Retirer la notification qu'une réaction a produite, quand la réaction est
 * défaite — septième occurrence de la famille ouverte aux cycles 46/47/48/50/51,
 * et la première dont le référent est un GESTE et non un CONTENU.
 *
 * Même cause que ses six aînées : la ligne `Notification` garde une copie
 * DÉNORMALISÉE de ce qui l'a produite (`metadata.reactionEmoji`, l'acteur,
 * l'extrait du contenu réagi), et rien ne la relie au référent par une
 * relation que la base saurait faire cascader. Le retrait d'une réaction est
 * d'ailleurs un `delete` DUR — `ReactionService.removeReaction` détruit la
 * ligne — et pourtant il ne laissait aucune trace côté notification :
 * « X a réagi ❤️ à votre message » survivait au ❤️.
 *
 * Même arbitrage : RETRAIT, pas neutralisation. La notification d'une réaction
 * n'annonce rien d'autre que la réaction ; celle-ci défaite, la ligne n'a plus
 * de sujet. Elle mène toujours quelque part (le message existe encore), mais
 * pour y montrer une réaction qui n'y est plus — c'est-à-dire pour mentir. Et
 * c'est le seul geste que les clients savent déjà recevoir
 * (`notification:deleted`, écouté par le web et par le SDK iOS).
 *
 * TROIS différences de forme avec ses aînées, et elles décident l'implémentation :
 *
 *  1. **Le référent n'a pas d'id dans la notification.** Un message, un post,
 *     un commentaire, une demande d'ami se nomment ; une réaction, non. Seule
 *     la CONJONCTION (type × cible × acteur × emoji) la désigne, et les quatre
 *     coordonnées sont nécessaires — chacune qui manque élargit le retrait à la
 *     réaction d'un tiers, à un autre emoji du même acteur, ou à la
 *     notification d'un contenu voisin.
 *  2. **L'emoji vit sous DEUX clés.** `message_reaction` et `comment_reaction`
 *     écrivent `metadata.reactionEmoji` ; `post_like`, `story_reaction`,
 *     `status_reaction` et `comment_like` écrivent `metadata.emoji`. Même
 *     divergence que les deux chemins de `commentId` côté
 *     `retractCommentNotifications`, et même conséquence si on n'en lit qu'une :
 *     la moitié de la famille reste en base. (Le correctif de fond serait
 *     d'uniformiser les producteurs ; il change un contrat lu par les clients,
 *     et n'aiderait pas les lignes DÉJÀ écrites.)
 *  3. **`type` porte la désambiguïsation, et rien d'autre ne le peut.** Un
 *     `comment_like` écrit `context.postId` — exactement la clé du `post_like`
 *     du post qui l'héberge. Sans le scope par type, retirer une réaction de
 *     POST emporterait les réactions aux COMMENTAIRES du même post par le même
 *     acteur avec le même emoji.
 *
 * **Aucun drainage, contrairement au post et au commentaire.** Ce qui les
 * oblige à boucler est l'AUDIENCE : un post notifie tout un voisinage. Une
 * réaction notifie une personne — l'auteur du contenu — donc au plus une ligne,
 * et le throttle par paire (`shouldCreateReactionNotification`) fait qu'en
 * régime normal il n'y en a même aucune. Le lot unique est très au-dessus du
 * réel ; il absorbe les doublons qu'un cycle ajout/retrait/ajout aurait pu
 * laisser sans jamais avoir à reboucler.
 */

/** Le contenu auquel la réaction retirée s'appliquait. */
export type ReactionSubject =
  | { readonly kind: 'message'; readonly id: string }
  | { readonly kind: 'post'; readonly id: string }
  | { readonly kind: 'comment'; readonly id: string };

/** Les quatre coordonnées qui, ensemble, désignent LA réaction défaite. */
export interface RemovedReaction {
  readonly subject: ReactionSubject;
  /** `User.id` du réacteur — PAS un `Participant.id`. */
  readonly actorId: string;
  readonly emoji: string;
}

/**
 * Les types de notification qu'une réaction produit, par nature de cible.
 *
 * Un même geste en produit plusieurs selon l'entité : réagir à une STORY donne
 * `story_reaction`, à un STATUS `status_reaction`, à un post ordinaire
 * `post_like` (cf. `createPostLikeNotification`). Le retrait ne connaît pas le
 * `postType` — il vient d'un `removeReaction` qui n'a que l'id — donc il
 * couvre les trois : viser trop large DANS la famille de la cible est sans
 * effet (les deux autres types ne matchent pas l'id), viser trop étroit
 * laisserait la ligne.
 */
const REACTION_NOTIFICATION_TYPES: Readonly<Record<ReactionSubject['kind'], readonly string[]>> = {
  message: ['message_reaction'],
  post: ['post_like', 'story_reaction', 'status_reaction'],
  comment: ['comment_reaction', 'comment_like'],
};

/**
 * Les chemins JSON sous lesquels chaque famille nomme sa cible.
 *
 * Le commentaire en a deux, pour la même raison que
 * `retractCommentNotifications` : `comment_reaction` écrit
 * `context.commentId`, `comment_like` écrit `metadata.commentId`.
 */
const SUBJECT_PATHS: Readonly<Record<ReactionSubject['kind'], readonly string[]>> = {
  message: ['context.messageId'],
  post: ['context.postId'],
  comment: ['context.commentId', 'metadata.commentId'],
};

/** Les deux clés sous lesquelles les producteurs écrivent l'emoji. */
const EMOJI_PATHS = ['metadata.reactionEmoji', 'metadata.emoji'] as const;

/**
 * Plafond du lot unique. Une réaction produit au plus UNE ligne ; la marge
 * couvre les doublons historiques sans jamais servir de pagination.
 */
export const REACTION_NOTIFICATION_RETRACTION_BATCH_SIZE = 50;

type RawObjectId = string | { $oid?: string };

type RawNotificationRow = {
  _id?: RawObjectId;
  userId?: RawObjectId;
  type?: unknown;
  context?: { conversationId?: unknown };
  delivery?: { pushSent?: unknown };
};

type RawNotificationBatch = {
  cursor?: { firstBatch?: ReadonlyArray<RawNotificationRow> };
};

/**
 * La seule surface Prisma que le retrait touche, énumérée pour qu'un appelant
 * sache exactement ce qu'il autorise.
 */
export interface ReactionNotificationRetractionPrisma {
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

/** `{ $or: [{ <chemin>: <valeur> }, …] }` — un chemin suffit à matcher. */
function anyPathEquals(paths: readonly string[], value: string): { $or: Record<string, string>[] } {
  return { $or: paths.map((path) => ({ [path]: value })) };
}

export async function retractReactionNotifications(
  prisma: ReactionNotificationRetractionPrisma,
  removed: RemovedReaction,
  announcer: RetractedNotificationAnnouncer | undefined
): Promise<number> {
  // Une coordonnée manquante n'est pas un filtre plus large : c'est un filtre
  // FAUX. Un `actor.id` vide ne restreint à personne, et le retrait emporterait
  // alors les réactions des autres au même contenu. Le cas se présente pour de
  // vrai — un réacteur ANONYME n'a pas de `User.id`, et `notifyReactionAdded`
  // refuse symétriquement de notifier pour lui.
  if (!removed.actorId || !removed.subject.id || !removed.emoji) return 0;

  const raw = (await prisma.$runCommandRaw({
    find: 'Notification',
    filter: {
      type: { $in: [...REACTION_NOTIFICATION_TYPES[removed.subject.kind]] },
      'actor.id': removed.actorId,
      // Deux `$or` ne peuvent pas coexister comme clés d'un même objet : la
      // conjonction passe donc par `$and`, et non par une fusion qui perdrait
      // silencieusement le premier.
      $and: [
        anyPathEquals(SUBJECT_PATHS[removed.subject.kind], removed.subject.id),
        anyPathEquals(EMOJI_PATHS, removed.emoji),
      ],
    },
    // `context.conversationId` pour le push de révocation : une réaction à un
    // MESSAGE vit dans une conversation, et deux clients ne savent retirer
    // leur bannière qu'à cette maille. `type` avec elle, et c'est lui qui
    // empêche la casse : la bannière d'une RÉACTION n'est pas indexée par la
    // conversation, et l'annuler à cette maille retirerait celle du dernier
    // message du fil.
    projection: { _id: 1, userId: 1, type: 1, 'context.conversationId': 1, 'delivery.pushSent': 1 },
    singleBatch: true,
    batchSize: REACTION_NOTIFICATION_RETRACTION_BATCH_SIZE,
  })) as RawNotificationBatch;

  const rows = raw?.cursor?.firstBatch ?? [];
  const ids = rows.map((row) => objectId(row._id)).filter((id): id is string => id !== undefined);
  if (ids.length === 0) return 0;

  await prisma.notification.deleteMany({ where: { id: { in: ids } } });

  // L'annonce APRÈS l'écriture durable, et jamais l'inverse : les compteurs
  // qu'elle recalcule doivent voir la base d'après le retrait. Une ligne sans
  // `userId` lisible n'est pas annonçable — elle est tout de même supprimée.
  const retracted = rows.flatMap((row) => {
    const id = objectId(row._id);
    const userId = objectId(row.userId);
    return id && userId
      ? [retractedNotificationOf({ id, userId, type: row.type, context: row.context, delivery: row.delivery })]
      : [];
  });
  if (retracted.length > 0) {
    await announcer?.announceNotificationsRetracted(retracted);
  }

  return ids.length;
}
