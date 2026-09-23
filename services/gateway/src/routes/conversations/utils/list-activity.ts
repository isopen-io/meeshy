import type { ConversationActiveCall, ConversationLastReaction } from '@meeshy/shared/types/conversation-preview';
import { LAST_REACTION_SELECT, resolveConversationLastReaction, type LastReactionRow } from './last-reaction';

/**
 * Ce qui s'est passé DEPUIS le dernier message d'une conversation (#7545) : sa
 * dernière réaction et l'appel en cours. Deux lectures BATCHÉES pour toute une
 * page de liste — jamais une requête par conversation.
 */

const LIVE_CALL_STATUSES = ['initiated', 'ringing', 'connecting', 'active', 'reconnecting'] as const;

export const ACTIVE_CALL_SELECT = {
  id: true,
  conversationId: true,
  status: true,
  startedAt: true,
  metadata: true,
  _count: { select: { participants: { where: { leftAt: null } } } },
} as const;

export interface ActiveCallRow {
  readonly id: string;
  readonly status: string;
  readonly startedAt: Date;
  readonly metadata?: unknown;
  readonly _count?: { readonly participants?: number } | null;
}

/** `null` pour une session close — `Conversation.activeCallId` peut survivre un instant à sa fin. */
export function resolveActiveCall(row: ActiveCallRow | null | undefined): ConversationActiveCall | null {
  if (!row || !(LIVE_CALL_STATUSES as readonly string[]).includes(row.status)) return null;
  const metadata = row.metadata !== null && typeof row.metadata === 'object'
    ? (row.metadata as Record<string, unknown>)
    : {};
  return {
    id: row.id,
    kind: metadata.type === 'video' ? 'video' : 'audio',
    participantCount: row._count?.participants ?? 0,
    startedAt: row.startedAt.toISOString(),
  };
}

export interface ListActivityConversation {
  readonly id: string;
  readonly lastReactionId?: string | null;
  readonly activeCallId?: string | null;
}

export interface ListActivityReader {
  readonly viewerLanguages: readonly string[];
  /** Plancher d'historique PAR conversation (arrivée tardive, historique effacé). */
  readonly historyFloorFor: (conversationId: string) => Date | null;
}

export interface ListActivity {
  readonly lastReaction: ConversationLastReaction | null;
  readonly activeCall: ConversationActiveCall | null;
}

export interface ListActivityPrisma {
  readonly reaction: { findMany(args: unknown): Promise<unknown[]> };
  readonly callSession: { findMany(args: unknown): Promise<unknown[]> };
}

/**
 * Charge et résout l'activité d'une page de conversations. Fail-CLOSED par
 * moitié : une lecture qui échoue rend `null` pour sa moitié — une ligne sans
 * réaction ni appel reste une ligne juste, jamais une page en erreur.
 */
export async function loadConversationListActivity(
  prisma: ListActivityPrisma,
  conversations: readonly ListActivityConversation[],
  reader: ListActivityReader,
  now: Date = new Date(),
): Promise<ReadonlyMap<string, ListActivity>> {
  const reactionIds = conversations.flatMap((c) => (c.lastReactionId ? [c.lastReactionId] : []));
  const callIds = conversations.flatMap((c) => (c.activeCallId ? [c.activeCallId] : []));

  const [reactions, calls] = await Promise.all([
    reactionIds.length === 0
      ? []
      : prisma.reaction
          .findMany({ where: { id: { in: reactionIds } }, select: LAST_REACTION_SELECT })
          .catch(() => []),
    callIds.length === 0
      ? []
      : prisma.callSession
          .findMany({ where: { id: { in: callIds } }, select: ACTIVE_CALL_SELECT })
          .catch(() => []),
  ]);

  const reactionById = new Map((reactions as Array<LastReactionRow & { id: string }>).map((r) => [r.id, r]));
  const callById = new Map((calls as ActiveCallRow[]).map((c) => [c.id, c]));

  return new Map(
    conversations.map((c) => [
      c.id,
      {
        lastReaction: resolveConversationLastReaction(
          c.lastReactionId ? reactionById.get(c.lastReactionId) : null,
          { viewerLanguages: reader.viewerLanguages, historyFloor: reader.historyFloorFor(c.id) },
          now,
        ),
        activeCall: resolveActiveCall(c.activeCallId ? callById.get(c.activeCallId) : null),
      },
    ]),
  );
}
