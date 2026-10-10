/**
 * Les sessions INVITÉES d'un lien de partage — `PATCH|DELETE /guest-sessions/me`
 * et leurs adaptateurs `POST /anonymous/refresh|leave` (#4167). Extrait de
 * `link-admission.ts`, qui garde l'ENTRÉE par lien : ici vit ce qui prolonge
 * ou termine une session déjà ouverte.
 */
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { hashSessionToken } from '../../utils/session-token';
import { isConversationClosed } from '../../services/messaging/conversationWriteAdmission';
import { announceConversationLanguageChange } from '../../services/message-translation/conversationLanguageChanges';
import type { ParticipantRow, ShareLinkWithConversation } from './link-admission';

export interface GuestSessionParams {
  readonly prisma: PrismaClient;
  readonly sessionToken: string;
}

export type RefreshGuestSessionOutcome =
  | { readonly kind: 'invalid' }
  | { readonly kind: 'link-gone' }
  | { readonly kind: 'link-expired' }
  | { readonly kind: 'conversation-closed' }
  | { readonly kind: 'refreshed'; readonly participant: ParticipantRow; readonly shareLink: ShareLinkWithConversation };

/**
 * Cœur de `PATCH /guest-sessions/me`, partagé avec l'adaptateur `POST
 * /anonymous/refresh`. Gagne la garde `isConversationClosed` que la porte
 * historique n'avait jamais eue — critère de fin #4 de #4167.
 */
export async function refreshGuestSession(params: GuestSessionParams): Promise<RefreshGuestSessionOutcome> {
  const { prisma, sessionToken } = params;
  const tokenHash = hashSessionToken(sessionToken);

  const participant = await prisma.participant.findFirst({
    where: { sessionTokenHash: tokenHash, type: 'anonymous' },
  });
  if (!participant || !participant.isActive) return { kind: 'invalid' };

  const shareLinkId = participant.anonymousSession?.shareLinkId;
  const shareLink = shareLinkId
    ? ((await prisma.conversationShareLink.findUnique({
        where: { id: shareLinkId },
        include: {
          conversation: { select: { id: true, title: true, type: true, isActive: true, closedAt: true } },
        },
      })) as ShareLinkWithConversation | null)
    : null;

  if (!shareLink || !shareLink.isActive) return { kind: 'link-gone' };
  if (shareLink.expiresAt && shareLink.expiresAt < new Date()) return { kind: 'link-expired' };
  if (isConversationClosed(shareLink.conversation)) return { kind: 'conversation-closed' };

  await prisma.participant.update({
    where: { id: participant.id },
    data: { lastActiveAt: new Date(), isOnline: true },
  });

  return { kind: 'refreshed', participant, shareLink };
}

export type EndGuestSessionOutcome = { readonly kind: 'not-found' } | { readonly kind: 'ended' };

/**
 * Cœur de `DELETE /guest-sessions/me`, partagé avec l'adaptateur `POST
 * /anonymous/leave`. IDEMPOTENT — critère de fin #4 de #4167 : `wasActive`
 * gèle l'état LU avant toute écriture, donc un second appel sur la MÊME
 * session ne marque rien inactif une seconde fois et ne décrémente jamais
 * deux fois `currentConcurrentUsers` (qui pouvait passer sous zéro).
 */
export async function endGuestSession(params: GuestSessionParams): Promise<EndGuestSessionOutcome> {
  const { prisma, sessionToken } = params;
  const tokenHash = hashSessionToken(sessionToken);

  const participant = await prisma.participant.findFirst({
    where: { sessionTokenHash: tokenHash, type: 'anonymous' },
  });
  if (!participant) return { kind: 'not-found' };

  const wasActive = participant.isActive;
  if (!wasActive) return { kind: 'ended' };

  await prisma.participant.update({
    where: { id: participant.id },
    data: { isActive: false, isOnline: false, leftAt: new Date() },
  });
  announceConversationLanguageChange({ kind: 'departure', conversationId: participant.conversationId });

  const shareLinkId = participant.anonymousSession?.shareLinkId;
  if (shareLinkId) {
    await prisma.conversationShareLink.update({
      where: { id: shareLinkId },
      data: { currentConcurrentUsers: { decrement: 1 } },
    });
  }

  return { kind: 'ended' };
}
