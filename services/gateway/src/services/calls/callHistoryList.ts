/**
 * LE JOURNAL DES APPELS (#8066) — sa lecture, extraite de `CallService`
 * (budget de taille) pour y ajouter l'effacement : `hideCallFromHistory` /
 * `clearCallHistory` masquent POUR SOI (`CallSession.hiddenForUserIds`),
 * jamais pour les autres membres de la conversation.
 */
import { CallStatus, type Prisma, type PrismaClient } from '@meeshy/shared/prisma/client';
import { applyPresenceVisibilityAsOffline } from '@meeshy/shared/utils/presence-visibility';
import { getPresenceVisibilityService, type PresenceViewer } from '../PresenceVisibilityService';
import {
  buildCallHistoryItem,
  type CallHistoryItem,
  type CallHistoryPeer,
  type CallHistoryRow
} from '../callHistory';
import { resolveGroupCallParticipants } from './callHistoryParticipants';
import { journalConversationsMatching, normalizedJournalQuery } from './callHistorySearch';

export type CallHistoryType = 'all' | 'audio' | 'video';

/** Call journal sliding window: 3 months. */
export const CALL_HISTORY_WINDOW_MS = 90 * 24 * 60 * 60 * 1000;

// Mirror of `CALL_TERMINAL_STATUSES` (@meeshy/shared/types/video-call),
// typed on the Prisma enum — keep both lists in sync.
const HISTORY_STATUSES: CallStatus[] = [
  CallStatus.ended,
  CallStatus.missed,
  CallStatus.rejected,
  CallStatus.failed
];

/**
 * CE QUE LE JOURNAL D'UN LECTEUR CONTIENT : les appels terminés de ses
 * conversations sur la fenêtre glissante, moins ceux qu'il a effacés (#8066).
 * La lecture et le « tout effacer » partagent cette portée : vider efface
 * exactement ce que le journal montrait.
 *
 * L'effacement se retire PAR IDENTIFIANT, jamais par `NOT: { hiddenForUserIds:
 * { has } }` (#8294) : sur MongoDB, Prisma double tout filtre de liste NIÉ d'une
 * exigence de présence du champ, et une session créée avant `@default([])` n'en
 * porte pas la clé — le journal rendait 0 appel. Aucun filtre typé ne dit
 * « champ absent » sur une liste scalaire (`isSet` n'y existe pas) ; `has`
 * POSITIF, lui, lit une clé absente comme « ne contient pas ».
 */
const journalScope = async (
  prisma: PrismaClient,
  userId: string,
  windowStart: Date
): Promise<Prisma.CallSessionWhereInput> => {
  const base: Prisma.CallSessionWhereInput = {
    startedAt: { gte: windowStart },
    status: { in: HISTORY_STATUSES },
    conversation: { participants: { some: { userId, isActive: true } } }
  };
  const hidden = await prisma.callSession.findMany({
    where: { ...base, hiddenForUserIds: { has: userId } },
    select: { id: true }
  });
  return hidden.length === 0 ? base : { ...base, id: { notIn: hidden.map((h) => h.id) } };
};

/**
 * Paginated call journal for a user: the terminal (ended/missed/rejected/
 * failed) calls in conversations they belong to, newest first, over a 3-month
 * sliding window. Cursor-paginated by call id.
 *
 * Peer resolution: for a direct (P2P) conversation the "other party" is the
 * conversation's other member — resolved from the conversation roster, not the
 * call participants — so a missed outgoing call (callee never joined) still
 * shows who was dialed. Group calls carry no peer (the conversation
 * name/avatar identifies them) and name who joined in `participants`
 * (`resolveGroupCallParticipants`, #8066) — never with any presence field.
 *
 * Peer presence (`CallHistoryPeer.isOnline`) is gated STRICT (directive
 * produit 2026-08-25) — `options.viewer` (the caller themselves, from
 * `viewerFromRequest`) must be the peer, an ADMIN/BIGBOSS, or their accepted
 * friend, else `isOnline` reads `false`. Being the conversation's other
 * member is what makes them a *peer* in this journal, never what makes them
 * *visible* — the two used to be conflated by loading `isOnline` raw off the
 * `Participant.user` roster query.
 */
export async function listCallHistory(
  prisma: PrismaClient,
  userId: string,
  options: {
    limit: number;
    cursor?: string;
    filter: 'all' | 'missed';
    type?: CallHistoryType;
    q?: string;
    viewer: PresenceViewer;
  }
): Promise<{ items: CallHistoryItem[]; hasMore: boolean; nextCursor?: string }> {
  const { limit, cursor, filter, viewer } = options;
  const windowStart = new Date(Date.now() - CALL_HISTORY_WINDOW_MS);

  const query = normalizedJournalQuery(options.q);
  const conversationIds = query === null ? null : await journalConversationsMatching(prisma, userId, query);
  if (conversationIds !== null && conversationIds.length === 0) return { items: [], hasMore: false, nextCursor: undefined };

  const where: Prisma.CallSessionWhereInput = await journalScope(prisma, userId, windowStart);
  if (conversationIds !== null) where.conversationId = { in: conversationIds };
  // Type d'appel (#8203) : `isVideo` est posé à la création ; un appel plus
  // ancien que ce champ (non encore rattrapé par la migration 020) n'en porte
  // pas et se lit « audio », comme `callIsVideo` le lit sur `metadata`. Sur
  // MongoDB, `NOT: { isVideo: true }` exclut aussi la clé ABSENTE (#8294) :
  // l'absence se dit `isSet: false`.
  if (options.type === 'video') where.isVideo = true;
  if (options.type === 'audio') {
    where.AND = [{ OR: [{ isVideo: { isSet: false } }, { isVideo: null }, { isVideo: false }] }];
  }
  if (filter === 'missed') {
    // A missed call, for THIS user, is either (a) the call-wide `missed`
    // status the ringing-timeout sets when nobody at all answered, or (b)
    // — mirroring `deriveCallDirection` (Vague 105) — a call that WAS
    // answered by someone else in a group conversation but this user never
    // personally got a `CallParticipant` row (declined, ignored, offline).
    // That second case reaches `status: 'ended'`, never `missed`: keying
    // this filter on `status` alone silently dropped every such row from
    // the "Missed" tab, even though `direction: 'missed'` already reports
    // it correctly under "All" (Vague 136). Narrowing via `where.OR`
    // instead of overwriting `where.status` keeps the base terminal-status
    // window (`missed` is already one of its members, so no conflict).
    where.initiatorId = { not: userId };
    where.OR = [
      { status: CallStatus.missed },
      { answeredAt: { not: null }, participants: { none: { participant: { userId } } } }
    ];
  }

  const rows = await prisma.callSession.findMany({
    where,
    orderBy: [{ startedAt: 'desc' }, { id: 'desc' }],
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    select: {
      id: true,
      conversationId: true,
      mode: true,
      status: true,
      endReason: true,
      initiatorId: true,
      startedAt: true,
      answeredAt: true,
      endedAt: true,
      duration: true,
      bytesSent: true,
      bytesReceived: true,
      metadata: true,
      reactionCounts: true,
      conversation: { select: { type: true, title: true, avatar: true } }
    }
  });

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor = hasMore ? page[page.length - 1]?.id : undefined;

  // Resolve all direct-call peers in a single batched roster query.
  const directConvIds = Array.from(
    new Set(page.filter((r) => r.conversation.type === 'direct').map((r) => r.conversationId))
  );
  const peerByConv = new Map<string, CallHistoryPeer>();
  if (directConvIds.length > 0) {
    const members = await prisma.participant.findMany({
      where: { conversationId: { in: directConvIds }, userId: { not: userId } },
      select: {
        conversationId: true,
        user: {
          select: {
            id: true,
            username: true,
            displayName: true,
            avatar: true,
            phoneNumber: true,
            isOnline: true
          }
        }
      }
    });
    for (const m of members) {
      if (m.user && !peerByConv.has(m.conversationId)) {
        peerByConv.set(m.conversationId, {
          userId: m.user.id,
          username: m.user.username,
          displayName: m.user.displayName ?? null,
          avatar: m.user.avatar ?? null,
          phoneNumber: m.user.phoneNumber ?? null,
          isOnline: m.user.isOnline
        });
      }
    }
  }

  // Gate peer presence STRICT — one batched resolution for the whole page,
  // keyed the same way `resolveForTargets` is everywhere else. `isOnline` is
  // NON-nullable on the wire (`CallHistoryPeer`, mirrored by the SDK's
  // `APICallRecord.peer.isOnline: Bool`), so `applyPresenceVisibilityAsOffline`
  // — not `applyPresenceVisibility` — keeps the key and folds "hidden" to
  // `false` rather than `null`.
  if (peerByConv.size > 0) {
    const peerUserIds = Array.from(new Set(Array.from(peerByConv.values(), (p) => p.userId)));
    const visibility = await getPresenceVisibilityService(prisma).resolveForTargets(viewer, peerUserIds);
    for (const [conversationId, peer] of peerByConv) {
      peerByConv.set(conversationId, applyPresenceVisibilityAsOffline(peer, visibility.get(peer.userId)));
    }
  }

  // Resolve, for each call the current user did NOT initiate, whether they
  // have their own `CallParticipant` row — i.e. they actually joined this
  // specific call, as opposed to merely being a conversation member. A
  // group member who never joined (declined, ignored, or lost a join race)
  // never gets a row, and must never be shown "incoming" just because the
  // call's shared `answeredAt` was set by participants who did join. See
  // `deriveCallDirection`.
  const nonOutgoingCallIds = page.filter((r) => r.initiatorId !== userId).map((r) => r.id);
  const participatedCallIds = new Set<string>();
  if (nonOutgoingCallIds.length > 0) {
    const myParticipations = await prisma.callParticipant.findMany({
      where: { callSessionId: { in: nonOutgoingCallIds }, participant: { userId } },
      select: { callSessionId: true }
    });
    for (const p of myParticipations) participatedCallIds.add(p.callSessionId);
  }

  const groupCallIds = page.filter((r) => r.conversation.type !== 'direct').map((r) => r.id);
  const participantsByCall = await resolveGroupCallParticipants(prisma, groupCallIds, userId);

  const items = page.map((row) =>
    buildCallHistoryItem(
      row as CallHistoryRow,
      userId,
      row.conversation.type === 'direct' ? peerByConv.get(row.conversationId) ?? null : null,
      participatedCallIds.has(row.id),
      participantsByCall.get(row.id) ?? []
    )
  );

  return { items, hasMore, nextCursor };
}

/**
 * Efface UN appel du journal de `userId` — pour lui seul. `not-found` quand
 * l'appel n'appartient à aucune de ses conversations (même réponse qu'un id
 * inexistant : on ne confirme pas l'existence d'un appel étranger).
 */
export async function hideCallFromHistory(
  prisma: PrismaClient,
  userId: string,
  callId: string
): Promise<'hidden' | 'not-found'> {
  const call = await prisma.callSession.findFirst({
    where: { id: callId, conversation: { participants: { some: { userId, isActive: true } } } },
    select: { id: true, hiddenForUserIds: true }
  });
  if (call === null) return 'not-found';
  if (call.hiddenForUserIds.includes(userId)) return 'hidden';
  await prisma.callSession.update({ where: { id: callId }, data: { hiddenForUserIds: { push: userId } } });
  return 'hidden';
}

/** Vide le journal de `userId` — pour lui seul — et rend le nombre d'appels effacés. */
export async function clearCallHistory(prisma: PrismaClient, userId: string): Promise<number> {
  const windowStart = new Date(Date.now() - CALL_HISTORY_WINDOW_MS);
  const result = await prisma.callSession.updateMany({
    where: await journalScope(prisma, userId, windowStart),
    data: { hiddenForUserIds: { push: userId } }
  });
  return result.count;
}
