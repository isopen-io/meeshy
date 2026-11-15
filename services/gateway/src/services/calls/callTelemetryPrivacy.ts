/**
 * Le SEUL accès RGPD à la télémétrie d'appel d'un compte (#11277).
 *
 * `CallParticipant.analytics` (le rapport `call:analytics` : modèle
 * d'appareil, plateforme, mesures) et `CallParticipant.feedback` (la note
 * d'après-appel et son commentaire LIBRE) sont des données personnelles
 * rattachées à un appel. Elles s'exportent (art. 20) et s'effacent à la purge
 * du compte (art. 17).
 *
 * La LIGNE `CallParticipant` survit à l'effacement : l'historique d'appel de
 * l'autre participant la lit encore (qui, quand, combien de temps), comme un
 * message anonymisé garde sa place dans le fil (#5689). Seules les deux
 * colonnes qui ne parlent QUE de ce compte partent. Un compte se résout par
 * ses `Participant.id` — `CallParticipant.participantId` n'est pas un
 * `User.id`.
 *
 * Effacement idempotent, et une panne PROPAGE, comme chaque suppression
 * voisine de la purge.
 */
import type { PrismaClient } from '@meeshy/shared/prisma/client';

export type CallTelemetryPrivacyClient = Pick<PrismaClient, 'participant' | 'callParticipant'>;

export type CallTelemetryExportRow = {
  readonly callId: string;
  readonly role: string;
  readonly joinedAt: Date;
  readonly leftAt: Date | null;
  readonly analytics: unknown;
  readonly feedback: unknown;
};

export type CallTelemetryExportSection = {
  readonly items: readonly CallTelemetryExportRow[];
  readonly total: number;
  readonly hasMore: boolean;
};

async function participantIdsOf(prisma: CallTelemetryPrivacyClient, userId: string): Promise<string[]> {
  const participants = await prisma.participant.findMany({ where: { userId }, select: { id: true } });
  return participants.map((participant) => participant.id);
}

export async function exportCallTelemetry(
  prisma: CallTelemetryPrivacyClient,
  userId: string,
  page: { readonly limit: number; readonly offset: number },
): Promise<CallTelemetryExportSection> {
  const ids = await participantIdsOf(prisma, userId);
  if (ids.length === 0) return { items: [], total: 0, hasMore: false };

  const where = { participantId: { in: ids } };
  const [rows, total] = await Promise.all([
    prisma.callParticipant.findMany({
      where,
      select: { callSessionId: true, role: true, joinedAt: true, leftAt: true, analytics: true, feedback: true },
      orderBy: { joinedAt: 'desc' },
      take: page.limit,
      skip: page.offset,
    }),
    prisma.callParticipant.count({ where }),
  ]);
  const items = rows.map(({ callSessionId, role, joinedAt, leftAt, analytics, feedback }) => ({
    callId: callSessionId,
    role: String(role),
    joinedAt,
    leftAt,
    analytics,
    feedback,
  }));
  return { items, total, hasMore: page.offset + items.length < total };
}

export async function eraseCallTelemetryOf(prisma: CallTelemetryPrivacyClient, userId: string): Promise<number> {
  const ids = await participantIdsOf(prisma, userId);
  if (ids.length === 0) return 0;
  const erased = await prisma.callParticipant.updateMany({
    where: { participantId: { in: ids } },
    data: { analytics: null, feedback: null },
  });
  return erased.count;
}
