/**
 * « Notre histoire » côté passerelle (#19378, chantier #18857) : la frise d'une
 * paire — premier message, entrée à chaque niveau EFFECTIF, jalons de messages.
 *
 * Ne s'appelle qu'APRÈS le verdict de la partie `history` (la route la garde) :
 * sous son cercle, rien n'est lu, donc rien ne se compte.
 *
 * - Les niveaux : la composition pure `resolvePairHistory` (shared) lit les seuls
 *   passages visibles de `UserRelation.transitions`, bornés au cercle commun
 *   (`niveauEffectif`, le site unique du niveau) — jamais un accord unilatéral, jamais une
 *   baisse (RG-07).
 * - Les messages : ceux que l'un des deux a écrits dans une conversation DIRECTE
 *   qu'ils partagent encore (participations actives des deux, conversation ni
 *   supprimée ni rendue obsolète), hors messages supprimés et messages système.
 *   « Entre les deux » : un groupe ne raconte pas l'histoire d'une paire. Seules
 *   des DATES et un comptage sortent — jamais un contenu, donc rien de plus d'une
 *   conversation chiffrée de bout en bout que ce que ses deux membres savent.
 *
 * Une lecture qui échoue LÈVE : l'appelant ferme.
 */
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { relationPairKey, type RelationLevel, type RelationTransition } from '@meeshy/shared/types/relation';
import {
  PAIR_HISTORY_MESSAGE_MILESTONES,
  resolvePairHistory,
  type PairHistoryItem,
} from '@meeshy/shared/utils/profile-pair-history';
import { niveauEffectif } from '../friendship';

const MEMBERSHIP_LIMIT = 5000;
const DIRECT = 'direct';

type TransitionRow = { readonly actorId?: string | null; readonly from: string; readonly to: string; readonly at?: Date | null };

const asTransitions = (rows: ReadonlyArray<TransitionRow> | null | undefined): RelationTransition[] =>
  (rows ?? []).flatMap((t) =>
    t.at instanceof Date && typeof t.actorId === 'string'
      ? [{ actorId: t.actorId, from: t.from as RelationLevel, to: t.to as RelationLevel, at: t.at }]
      : [],
  );

/** Les conversations directes où les DEUX sont encore participants actifs. */
async function sharedDirectConversations(prisma: PrismaClient, viewerId: string, targetId: string): Promise<string[]> {
  const mine = await prisma.participant.findMany({
    where: { userId: viewerId, isActive: true },
    select: { conversationId: true },
    take: MEMBERSHIP_LIMIT,
  });
  if (mine.length === 0) return [];
  const theirs = await prisma.participant.findMany({
    where: { userId: targetId, isActive: true, conversationId: { in: mine.map((m) => m.conversationId) } },
    select: { conversationId: true },
    take: MEMBERSHIP_LIMIT,
  });
  if (theirs.length === 0) return [];
  const conversations = await prisma.conversation.findMany({
    where: { id: { in: [...new Set(theirs.map((p) => p.conversationId))] }, type: DIRECT },
    select: { id: true, isActive: true, deletedAt: true },
    take: MEMBERSHIP_LIMIT,
  });
  return conversations.filter((c) => c.isActive !== false && !c.deletedAt).map((c) => c.id);
}

async function messageFacts(prisma: PrismaClient, viewerId: string, targetId: string) {
  const conversationIds = await sharedDirectConversations(prisma, viewerId, targetId);
  if (conversationIds.length === 0) return { firstMessageAt: null, milestones: [] };
  const where = {
    conversationId: { in: conversationIds },
    senderId: { in: [viewerId, targetId] },
    messageSource: 'user',
    deletedAt: null,
  };
  const [first, total] = await Promise.all([
    prisma.message.findFirst({ where, orderBy: { createdAt: 'asc' }, select: { createdAt: true } }),
    prisma.message.count({ where }),
  ]);
  const reached = PAIR_HISTORY_MESSAGE_MILESTONES.filter((count) => count <= total);
  const milestones = await Promise.all(
    reached.map(async (count) => {
      const row = await prisma.message.findFirst({ where, orderBy: { createdAt: 'asc' }, skip: count - 1, select: { createdAt: true } });
      return row ? [{ count, at: row.createdAt }] : [];
    }),
  );
  return { firstMessageAt: first?.createdAt ?? null, milestones: milestones.flat() };
}

export async function pairHistory(
  prisma: PrismaClient,
  params: { readonly viewerId: string; readonly targetId: string },
): Promise<PairHistoryItem[]> {
  const { viewerId, targetId } = params;
  const [effectiveLevel, relation, messages] = await Promise.all([
    niveauEffectif(prisma, viewerId, targetId),
    prisma.userRelation.findUnique({
      where: { userLowId_userHighId: relationPairKey(viewerId, targetId) },
      select: { transitions: true },
    }),
    messageFacts(prisma, viewerId, targetId),
  ]);
  return resolvePairHistory({
    transitions: asTransitions(relation?.transitions),
    effectiveLevel,
    actorIds: [viewerId, targetId],
    ...messages,
  });
}
