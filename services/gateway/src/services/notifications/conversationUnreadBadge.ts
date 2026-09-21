import type { PrismaClient } from '@meeshy/shared/prisma/client';

/**
 * G3 (#7218, Closes #7001) — `aps.badge` compte les CONVERSATIONS non lues
 * du destinataire, jamais les notifications ni la somme de leurs messages.
 *
 * **D-L1** (`docs/superpowers/specs/2026-09-21-lecture-et-accuses-design.md`
 * § 3) : « le badge d'icône compte les CONVERSATIONS non lues (hors
 * muettes), comme l'app iOS et comme WhatsApp ». Une conversation à douze
 * messages non lus pèse UN, exactement comme `countUnreadConversations`
 * côté web-v2 (`apps/web-v2/src/lib/view/use-app-badge.ts:36-45`, W4/#7221) :
 * `ConversationReadCursor.unreadCount > 0` est un BOOLÉEN par conversation,
 * pas un total à sommer.
 *
 * **Écart avec iOS, consigné et non bloquant** : `ConversationReadLedger`
 * (`packages/MeeshySDK/Sources/MeeshySDK/Store/ConversationReadLedger.swift:270-279`)
 * somme aujourd'hui `unreadCount` (un compte de MESSAGES), pas un booléen.
 * #7236 (décision-produit, ouverte) demande l'arbitrage porteur avant que
 * les trois plateformes convergent ; le critère de fin de G3 tranche pour ce
 * lot à la lettre de D-L1 (voir commentaire d'ouverture sur #7218 / #7001).
 *
 * Repli fermé implicite par construction : `unreadCount` vient du cache
 * `ConversationReadCursor`, jamais recalculé ici — un curseur absent (aucune
 * ligne, ex. une notification sociale seule comme une demande d'ami) ne
 * compte pas, ce qui est le comportement attendu, pas une panne.
 */
export async function computeConversationUnreadBadge(
  prisma: PrismaClient,
  userId: string
): Promise<number> {
  const participants = await prisma.participant.findMany({
    where: { userId, isActive: true },
    select: { id: true, conversationId: true },
  });
  if (participants.length === 0) return 0;

  const participantIds = participants.map((p) => p.id);

  const [unreadCursors, mutedRows] = await Promise.all([
    prisma.conversationReadCursor.findMany({
      where: { participantId: { in: participantIds }, unreadCount: { gt: 0 } },
      select: { conversationId: true },
    }),
    prisma.userConversationPreferences.findMany({
      where: { userId, isMuted: true },
      select: { conversationId: true },
    }),
  ]);

  const mutedConversationIds = new Set(mutedRows.map((row) => row.conversationId));

  return unreadCursors.filter((cursor) => !mutedConversationIds.has(cursor.conversationId)).length;
}
