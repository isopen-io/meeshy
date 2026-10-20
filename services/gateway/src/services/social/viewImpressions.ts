import type { PrismaClient } from '@meeshy/shared/prisma/client';
import type { SocialEvent } from '../../routes/social/eventsSchemas';
import { incrementPostCounters } from '../posts/postCounters';
import { rawReadingRetentionMs } from '../../config/raw-reading-retention';
import { accountReaderKeyOf } from '../posts/readerKey';

/**
 * Une VUE implique une IMPRESSION (#10732) : on ne voit pas ce qui n'a pas été
 * affiché. Les deux voyagent pourtant par des chemins différents — la vue
 * d'une story par la file durable, son impression par un lot groupé ; une
 * vue Android ou d'une version ancienne sans aucune impression — et des
 * stories finissaient avec plus de vues que d'impressions.
 *
 * Deux garanties, aucune ne compte deux fois :
 *
 *  - une vue qui porte la CLÉ de son impression ({@link impressionsCarriedByViews})
 *    l'écrit sous cette clé ; le lot d'impressions qui la porte plus tard est
 *    un rejeu, et l'inverse aussi. Exact, quel que soit l'ordre ;
 *  - une vue SANS clé (ancien client) d'un lecteur qui n'a aucune impression
 *    du post en DÉDUIT une ({@link impressionImpliedByView}), marquée
 *    `source: 'view'` — seulement une vue que `recordView` a COMPTÉE (audience,
 *    post vivant, lecteur ≠ auteur). La première vraie impression de ce lecteur la REMPLACE
 *    ({@link consumeImpliedImpressions}) au lieu de s'y ajouter.
 */

/** La source d'une impression qu'aucun client n'a envoyée : elle est déduite d'une vue. */
export const VIEW_IMPLIED_IMPRESSION_SOURCE = 'view';

type ViewEvent = Extract<SocialEvent, { type: 'view' }>;
type ImpressionEvent = Extract<SocialEvent, { type: 'impression' }>;

type ViewImpressionsPrisma = Pick<PrismaClient, 'postImpression' | '$runCommandRaw'>;

/**
 * Le même lecteur sous ses DEUX formes : nominative, et l'empreinte des lignes
 * réduites écrites entre #10773 et #10785 — plus produites, lues jusqu'à leur
 * expiration (8 jours).
 */
const ofReader = (userId: string) => ({ OR: [{ userId }, { readerKey: accountReaderKeyOf(userId) }] });

/** Les impressions que des vues portent, sous LEUR clé — à écrire comme toute impression à clé. */
export const impressionsCarriedByViews = (views: readonly ViewEvent[]): ImpressionEvent[] =>
  views.flatMap((view) => view.impression
    ? [{
      type: 'impression' as const,
      postId: view.postId,
      source: view.impression.source,
      surface: view.surface,
      eventId: view.impression.eventId,
      occurredAt: view.occurredAt,
    } as ImpressionEvent]
    : []);

/**
 * La vue SANS clé d'un compte, COMPTÉE par `recordView` — donc déjà passée par
 * le filtre d'audience, sur un post non supprimé, et jamais celle de l'auteur :
 * si le lecteur n'a encore aucune impression de ce post, une impression
 * déduite (`source: 'view'`) et son crédit. Au plus une par lecteur et par post.
 */
export async function impressionImpliedByView(
  prisma: ViewImpressionsPrisma,
  params: { readonly postId: string; readonly userId: string; readonly surface?: string },
): Promise<boolean> {
  const shown = await prisma.postImpression.findFirst({
    where: { postId: params.postId, ...ofReader(params.userId) },
    select: { id: true },
  });
  if (shown) return false;
  // Nominative quel que soit le statut d'analyse (#10785) : « qui a vu ».
  await prisma.postImpression.createMany({
    data: [{
      postId: params.postId,
      userId: params.userId,
      source: VIEW_IMPLIED_IMPRESSION_SOURCE,
      ...(params.surface ? { surface: params.surface } : {}),
      expiresAt: new Date(Date.now() + rawReadingRetentionMs()),
    }],
  });
  await incrementPostCounters(prisma, [params.postId], { impressionCount: { increment: 1 } });
  return true;
}

/**
 * Les vraies impressions d'un compte qui viennent d'être écrites RETIRENT
 * autant d'impressions déduites du même lecteur sur le même post : elles
 * prennent leur place, et le compteur n'en reçoit que l'excédent. Rend, par
 * post, le nombre d'impressions qui ne doivent PAS être recréditées.
 */
export async function consumeImpliedImpressions(
  prisma: Pick<PrismaClient, 'postImpression'>,
  userId: string,
  postIds: readonly string[],
): Promise<ReadonlyMap<string, number>> {
  if (postIds.length === 0) return new Map();
  const implied: readonly { id: string; postId: string }[] = await prisma.postImpression.findMany({
    where: { ...ofReader(userId), postId: { in: [...new Set(postIds)] }, source: VIEW_IMPLIED_IMPRESSION_SOURCE },
    select: { id: true, postId: true },
  });
  if (implied.length === 0) return new Map();

  const shown = postIds.reduce<Map<string, number>>((acc, id) => acc.set(id, (acc.get(id) ?? 0) + 1), new Map());
  const consumed = implied.reduce<{ ids: string[]; perPost: Map<string, number> }>((acc, row) => {
    const taken = acc.perPost.get(row.postId) ?? 0;
    if (taken >= (shown.get(row.postId) ?? 0)) return acc;
    return { ids: [...acc.ids, row.id], perPost: acc.perPost.set(row.postId, taken + 1) };
  }, { ids: [], perPost: new Map() });

  await prisma.postImpression.deleteMany({ where: { id: { in: consumed.ids } } });
  return consumed.perPost;
}

/** La clé DÉTERMINISTE de l'unique impression qu'un auteur compte sur son propre contenu. */
export const selfImpressionEventId = (userId: string, postId: string): string =>
  `self-impression:${userId}:${postId}`;

/**
 * L'auteur ne compte qu'UNE impression par contenu (#11037, porteur
 * 2026-10-19) ; tout autre lecteur compte à chaque affichage (#10483).
 *
 * Rend les impressions à écrire : celles des autres posts telles quelles, et
 * pour chaque post de l'auteur qui n'a encore aucune impression de lui, la
 * première occurrence sous {@link selfImpressionEventId}. L'index unique
 * partiel d'`eventKey` refuse la seconde même quand deux lots concurrents
 * passent la lecture ensemble ; la lecture couvre les lignes écrites avant
 * cette règle, qui ne portent pas cette clé. Lecture par compte au même titre
 * que les deux ci-dessus : l'intégrité du compteur, jamais un classement.
 */
export async function authorImpressionsOnce(
  prisma: Pick<PrismaClient, 'postImpression'>,
  userId: string,
  events: readonly ImpressionEvent[],
  ownPostIds: ReadonlySet<string>,
): Promise<readonly ImpressionEvent[]> {
  const ownShown = [...ownPostIds].filter((postId) => events.some((event) => event.postId === postId));
  if (ownShown.length === 0) return events;

  const alreadyShown: readonly { postId: string }[] = await prisma.postImpression.findMany({
    where: { ...ofReader(userId), postId: { in: ownShown } },
    select: { postId: true },
  });
  const shown = new Set(alreadyShown.map((row) => row.postId));

  const own = ownShown
    .filter((postId) => !shown.has(postId))
    .flatMap((postId) => {
      const first = events.find((event) => event.postId === postId);
      return first ? [{ ...first, eventId: selfImpressionEventId(userId, postId) }] : [];
    });

  return [...events.filter((event) => !ownPostIds.has(event.postId)), ...own];
}
