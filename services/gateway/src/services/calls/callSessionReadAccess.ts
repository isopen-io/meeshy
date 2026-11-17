import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { CALL_TERMINAL_STATUSES } from '@meeshy/shared/types/video-call';

/**
 * QUI LIT UNE SESSION D'APPEL (`GET /calls/:id`, CVE-003, #19238).
 *
 * Trois portes, et aucune autre : être dans l'appel, être membre ACTIF de la
 * conversation, ou y être INVITÉ (`invitedUserIds`) tant que l'appel vit et
 * qu'on n'est pas banni de la conversation. Ce dernier cas est celui d'une
 * personne réveillée par le push d'invitation : elle n'est encore ni
 * participante ni membre, et doit lire l'appel qu'on lui propose. La porte ne
 * donne que la LECTURE ; rejoindre passe par `resolveInvitedGuestParticipantId`.
 */

const TERMINAL: ReadonlySet<string> = new Set(CALL_TERMINAL_STATUSES);

export type ReadableCallSession = {
  readonly conversationId: string;
  readonly status: string;
  readonly invitedUserIds?: readonly string[] | null;
  readonly participants: ReadonlyArray<{ readonly participant?: { readonly userId?: string | null } | null }>;
};

export async function mayReadCallSession(
  prisma: Pick<PrismaClient, 'participant'>,
  call: ReadableCallSession,
  userId: string
): Promise<boolean> {
  if (call.participants.some((p) => p.participant?.userId === userId)) return true;

  const member = await prisma.participant.findFirst({
    where: { conversationId: call.conversationId, userId, isActive: true },
  });
  if (member) return true;

  if (TERMINAL.has(call.status) || !(call.invitedUserIds ?? []).includes(userId)) return false;
  const standing = await prisma.participant.findFirst({
    where: { conversationId: call.conversationId, userId },
    select: { bannedAt: true },
  });
  return !standing?.bannedAt;
}
