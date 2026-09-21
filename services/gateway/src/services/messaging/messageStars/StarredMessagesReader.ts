/**
 * La liste des favoris de message d'un lecteur (#7377) — la plus récente
 * d'abord, paginée par keyset opaque sur `(createdAt, id)` de l'ÉTOILE.
 *
 * Elle COMPOSE des garanties déjà éprouvées, jamais ne les réécrit — même
 * patron que `routes/attachments/search.ts` :
 *   1. Participation COURANTE (règle 1) — les conversations où le lecteur est
 *      actif et non banni, filtrées DANS la requête des étoiles
 *      (`MessageStar.conversationId`), pour que quitter une conversation ne
 *      raccourcisse pas les pages. L'étoile n'est jamais effacée.
 *   2. Plancher d'historique — `loadHistoryFloorsOrFail`, fail-CLOSED : une
 *      conversation dont le plancher est illisible sort de l'ensemble.
 *   3. Masquage personnel — `loadPersonalHistoryHidingByConversation`, appliqué
 *      APRÈS le keyset, comme `/sync` (une courtoisie : illisible ⇒ on sert).
 *   4. Le verdict du message (règles 2 et 3) — `starredMessageVerdict`, le
 *      même que la pose d'une étoile.
 *   5. Un expéditeur disparu répare la portée de la page et rejoue la lecture
 *      (`withOrphanedSenderRepair`, #6501) au lieu de la rendre illisible.
 *
 * Les critères 2 à 4 se tranchent en mémoire, sur les lignes déjà chargées :
 * une page peut donc être COURTE. Le curseur avance sur la dernière étoile
 * LUE, jamais sur la dernière servie — aucune ligne n'est sautée, et `hasMore`
 * reste juste.
 */
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import type { StarredMessageItem } from '@meeshy/shared/types/message-star';

import { decodeCursor, encodeCursor, keysetBeforeClause } from '../../../utils/keyset-cursor';
import { unsetOrNull } from '../../../utils/prisma-unset';
import { HISTORY_FLOOR_PARTICIPANT_SELECT, loadHistoryFloorsOrFail } from '../../historyFloor';
import { NO_PERSONAL_HIDING, loadPersonalHistoryHidingByConversation } from '../../personalHistoryFilter';
import { withOrphanedSenderRepair } from '../withOrphanedSenderRepair';
import {
  STARRED_CONVERSATION_SELECT,
  STARRED_DIRECT_PEER_SELECT,
  STARRED_MESSAGE_SELECT,
  projectStarredItem,
  type StarredDirectPeerRow,
} from './starredMessageProjection';
import { readableByReader, starredMessageVerdict } from './starredMessageVerdict';

/**
 * Plafond de PROTECTION des participations lues, jamais une pagination produit
 * — même borne et même raison que `routes/attachments/search.ts`.
 */
const MEMBERSHIPS_READ_CAP = 5000;

/** Deux participants au plus dans un direct ; la marge absorbe une ligne dupliquée héritée. */
const DIRECT_PEERS_PER_CONVERSATION = 4;

export type StarredMessagesPage = {
  readonly kind: 'page';
  readonly items: readonly StarredMessageItem[];
  readonly hasMore: boolean;
  readonly nextCursor: string | null;
};

export type StarredMessagesOutcome = StarredMessagesPage | { readonly kind: 'invalid-cursor' };

const EMPTY_PAGE: StarredMessagesPage = { kind: 'page', items: [], hasMore: false, nextCursor: null };

function unique(values: readonly string[]): string[] {
  return [...new Set(values)];
}

export class StarredMessagesReader {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async list(
    userId: string,
    params: { readonly cursor?: string | undefined; readonly limit: number },
  ): Promise<StarredMessagesOutcome> {
    const cursor = params.cursor === undefined ? null : decodeCursor(params.cursor);
    if (params.cursor !== undefined && cursor === null) return { kind: 'invalid-cursor' };

    const memberships = await this.prisma.participant.findMany({
      where: { userId, isActive: true, ...unsetOrNull('bannedAt') },
      select: { conversationId: true, ...HISTORY_FLOOR_PARTICIPANT_SELECT },
      take: MEMBERSHIPS_READ_CAP,
    });
    if (memberships.length === 0) return EMPTY_PAGE;

    const { floors, unreadableConversationIds } = await loadHistoryFloorsOrFail(this.prisma, memberships);
    const unreadable = new Set(unreadableConversationIds);
    const readableConversationIds = unique(memberships.map((m) => m.conversationId)).filter((id) => !unreadable.has(id));
    if (readableConversationIds.length === 0) return EMPTY_PAGE;

    const stars = await this.prisma.messageStar.findMany({
      where: {
        userId,
        conversationId: { in: readableConversationIds },
        ...(cursor ? keysetBeforeClause(cursor) : {}),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: params.limit + 1,
      select: { id: true, messageId: true, conversationId: true, createdAt: true },
    });
    const hasMore = stars.length > params.limit;
    const page = hasMore ? stars.slice(0, params.limit) : stars;
    const lastRead = page[page.length - 1];
    const nextCursor = hasMore && lastRead ? encodeCursor(lastRead.createdAt, lastRead.id) : null;
    if (page.length === 0) return { kind: 'page', items: [], hasMore, nextCursor };

    const conversationIds = unique(page.map((star) => star.conversationId));
    const [messages, conversations, hidingByConversation] = await Promise.all([
      // `sender` est une relation REQUISE : UN expéditeur disparu (#6501)
      // ferait rejeter toute la page. La portée de la réparation est connue —
      // les conversations des étoiles lues, les seules que cette lecture
      // parcourt.
      withOrphanedSenderRepair({ prisma: this.prisma, conversationIds }, () =>
        this.prisma.message.findMany({
          where: { id: { in: page.map((star) => star.messageId) } },
          select: STARRED_MESSAGE_SELECT,
          take: page.length,
        }),
      ),
      this.prisma.conversation.findMany({
        where: { id: { in: conversationIds } },
        select: STARRED_CONVERSATION_SELECT,
        take: conversationIds.length,
      }),
      loadPersonalHistoryHidingByConversation(this.prisma, { userId, conversationIds }),
    ]);
    const peers = await this.loadDirectPeers(userId, conversations.filter((c) => c.type === 'direct').map((c) => c.id));

    const messagesById = new Map(messages.map((message) => [message.id, message]));
    const conversationsById = new Map(conversations.map((conversation) => [conversation.id, conversation]));
    const now = this.now();

    const items = page.flatMap((star): StarredMessageItem[] => {
      const message = messagesById.get(star.messageId);
      const conversation = conversationsById.get(star.conversationId);
      if (!message || !conversation || message.conversationId !== star.conversationId) return [];

      const verdict = starredMessageVerdict(message, now);
      if (verdict === 'gone' || verdict === 'view-once') return [];

      const reader = {
        floor: floors.get(star.conversationId) ?? null,
        hiding: hidingByConversation.get(star.conversationId) ?? NO_PERSONAL_HIDING,
      };
      if (!readableByReader(message, reader)) return [];

      return [projectStarredItem({ star, message, verdict, conversation, directPeer: peers.get(conversation.id) ?? null })];
    });

    return { kind: 'page', items, hasMore, nextCursor };
  }

  /** L'autre participant ACTIF de chaque conversation directe de la page — un seul appel. */
  private async loadDirectPeers(
    userId: string,
    directConversationIds: readonly string[],
  ): Promise<ReadonlyMap<string, StarredDirectPeerRow>> {
    if (directConversationIds.length === 0) return new Map();
    const rows = await this.prisma.participant.findMany({
      where: { conversationId: { in: [...directConversationIds] }, isActive: true, NOT: { userId } },
      select: STARRED_DIRECT_PEER_SELECT,
      take: directConversationIds.length * DIRECT_PEERS_PER_CONVERSATION,
    });
    // Le PREMIER pair lu par conversation : `new Map` garde la dernière entrée
    // d'une clé, d'où la lecture à rebours.
    return new Map([...rows].reverse().map((row) => [row.conversationId, row] as const));
  }
}
