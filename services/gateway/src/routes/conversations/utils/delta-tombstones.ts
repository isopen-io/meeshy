/**
 * Pierres tombales du delta `GET /conversations?updatedSince=`.
 *
 * Le delta réutilise le `whereClause` de la liste : `isActive: true` sur la
 * conversation, et un participant `isActive: true` sans `deletedForMe`. C'est
 * exactement ce qu'il faut pour SERVIR une ligne, et exactement ce qui rend une
 * DISPARITION invisible — une conversation fermée, quittée, supprimée-pour-moi
 * depuis un autre appareil, ou dont l'utilisateur a été banni pendant sa
 * coupure ne sort d'aucune réponse delta. Elle reste en cache local jusqu'à la
 * réconciliation complète : 24 h côté iOS (`fullReconcileInterval`) comme côté
 * web (`FULL_RECONCILE_INTERVAL_MS`).
 *
 * Ce module rend la liste des ids qui ont QUITTÉ la vue de l'utilisateur depuis
 * `since`. Symétrique exact de `meta.deletedStoryIds` sur le tray stories.
 *
 * Trois propriétés que les appelants tiennent pour acquises :
 *
 *   1. **Le leave et le ban n'écrivent QUE la ligne `Participant`** —
 *      `Conversation.updatedAt` ne bouge pas. Interroger la conversation ne les
 *      verrait donc jamais : les deux streams participants sont indispensables,
 *      ils ne sont pas une optimisation.
 *   2. **Le stream « fermées » ne filtre PAS sur un participant ACTIF.** Un
 *      banni porte `isActive: false` ; le filtrer lui cacherait justement la
 *      fermeture qu'il doit voir.
 *   3. **La troncature se prouve par une sonde `cap + 1`**, jamais par une
 *      égalité sur le cap : une fenêtre de très exactement `cap` tombstones est
 *      COMPLÈTE, et l'annoncer tronquée déclencherait une relecture entière
 *      pour rien.
 *
 * Posture d'échec : `truncated: true` avec une liste vide. Le client escalade
 * alors vers la réconciliation complète, qui est précisément le recours dont il
 * dispose — là où faire échouer la LISTE parce qu'on n'a pas su calculer une
 * purge inverserait le compromis (afficher les conversations est le produit,
 * en retirer une est une courtoisie).
 */

import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { logger } from '../../../utils/logger';

/**
 * Plafond par stream. Même valeur que `STORY_TOMBSTONE_LIMIT`
 * (`services/posts/PostFeedService.ts`) — les deux répondent à la même
 * question, sur le même geste client.
 */
export const CONVERSATION_TOMBSTONE_LIMIT = 500;

export interface ConversationTombstones {
  /** Ids dédupliqués des conversations sorties de la vue depuis `since`. */
  readonly ids: string[];
  /** `true` ⇒ la liste est INCOMPLÈTE : le client doit réconcilier en entier. */
  readonly truncated: boolean;
}

const NO_TOMBSTONES: ConversationTombstones = Object.freeze({
  ids: Object.freeze([]) as unknown as string[],
  truncated: false,
});

export interface LoadConversationTombstonesParams {
  /** Un participant anonyme ne possède aucune de ces lignes. */
  readonly userId: string | null | undefined;
  /** Borne STRICTE, alignée sur celle du delta lui-même (`updatedAt > since`). */
  readonly since: Date;
}

export async function loadConversationTombstones(
  prisma: PrismaClient,
  { userId, since }: LoadConversationTombstonesParams
): Promise<ConversationTombstones> {
  if (!userId) return NO_TOMBSTONES;

  const take = CONVERSATION_TOMBSTONE_LIMIT + 1;

  try {
    const [closed, deletedForMe, leftOrBanned] = await Promise.all([
      prisma.conversation.findMany({
        where: { closedAt: { gt: since }, participants: { some: { userId } } },
        select: { id: true },
        take,
      }),
      prisma.participant.findMany({
        where: { userId, deletedForMe: { gt: since } },
        select: { conversationId: true },
        take,
      }),
      prisma.participant.findMany({
        where: { userId, OR: [{ leftAt: { gt: since } }, { bannedAt: { gt: since } }] },
        select: { conversationId: true },
        take,
      }),
    ]);

    const truncated =
      closed.length > CONVERSATION_TOMBSTONE_LIMIT ||
      deletedForMe.length > CONVERSATION_TOMBSTONE_LIMIT ||
      leftOrBanned.length > CONVERSATION_TOMBSTONE_LIMIT;

    const ids = new Set<string>();
    for (const row of closed.slice(0, CONVERSATION_TOMBSTONE_LIMIT)) ids.add(row.id);
    for (const row of deletedForMe.slice(0, CONVERSATION_TOMBSTONE_LIMIT)) ids.add(row.conversationId);
    for (const row of leftOrBanned.slice(0, CONVERSATION_TOMBSTONE_LIMIT)) ids.add(row.conversationId);

    return { ids: [...ids], truncated };
  } catch (error) {
    logger.warn('[deltaTombstones] lookup failed, asking the client to reconcile in full', {
      error: error instanceof Error ? error.message : String(error),
    });
    return { ids: [], truncated: true };
  }
}
