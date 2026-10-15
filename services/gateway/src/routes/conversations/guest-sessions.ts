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
import { guestAccessEnd } from '../../services/guestAccessEnd';
import { guestShareLinkId } from '../../services/shareLinkReadGate';
import type { ParticipantRow, ShareLinkWithConversation } from './link-admission';

export interface GuestSessionParams {
  readonly prisma: PrismaClient;
  readonly sessionToken: string;
}

export type RefreshGuestSessionOutcome =
  | { readonly kind: 'invalid' }
  | { readonly kind: 'revoked' }
  | { readonly kind: 'link-gone' }
  | { readonly kind: 'link-expired' }
  | { readonly kind: 'conversation-closed' }
  | { readonly kind: 'refreshed'; readonly participant: ParticipantRow; readonly shareLink: ShareLinkWithConversation };

/**
 * Cœur de `PATCH /guest-sessions/me`, partagé avec l'adaptateur `POST
 * /anonymous/refresh`. Gagne la garde `isConversationClosed` que la porte
 * historique n'avait jamais eue — critère de fin #4 de #4167.
 *
 * #10457 — une participation MORTE (désactivée OU bannie) rend `revoked`, le
 * 410 `GUEST_ACCESS_REVOKED` des autres portes, sans rien servir de la
 * conversation ni relancer la présence. Un banni encore actif obtenait
 * `refreshed` ; un désactivé, le 401 d'un jeton inventé. L'ordre est celui des
 * autres portes (`guestAccessEnd`) : lien expiré d'abord.
 */
export async function refreshGuestSession(params: GuestSessionParams): Promise<RefreshGuestSessionOutcome> {
  const { prisma, sessionToken } = params;
  const tokenHash = hashSessionToken(sessionToken);

  const participant = await prisma.participant.findFirst({
    where: { sessionTokenHash: tokenHash, type: 'anonymous' },
  });
  if (!participant) return { kind: 'invalid' };

  // #10464 — le lien se lit comme aux autres portes : la colonne de la
  // participation d'abord, la session embarquée en repli.
  const shareLinkId = guestShareLinkId(participant);
  const shareLink = shareLinkId
    ? ((await prisma.conversationShareLink.findUnique({
        where: { id: shareLinkId },
        include: {
          conversation: { select: { id: true, identifier: true, title: true, type: true, isActive: true, closedAt: true } },
        },
      })) as ShareLinkWithConversation | null)
    : null;

  const end = guestAccessEnd({
    linkExpiresAt: shareLink?.expiresAt ?? null,
    linkRevocationPendingAt: shareLink?.guestRevocationPendingAt ?? null,
    participation: participant,
    now: new Date(),
  });
  if (end === 'link-expired') return { kind: 'link-expired' };
  if (end === 'revoked') return { kind: 'revoked' };
  if (!shareLink || !shareLink.isActive) return { kind: 'link-gone' };
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
 * /anonymous/leave`. IDEMPOTENT — critère de fin #4 de #4167.
 *
 * #10472 — la désactivation est CONDITIONNELLE (`isActive: true` dans le
 * `where`) : seule l'écriture qui fait passer la ligne à inactif annonce le
 * départ et libère la place. Une sortie concurrente d'une révocation de lien
 * (ou d'une autre sortie) ne réécrit plus son `leftAt` et ne décrémente plus
 * deux fois. Le décrément est BORNÉ à un compteur positif, et un lien supprimé
 * entre-temps ne fait plus lever P2025 (`updateMany` rend 0, la sortie
 * réussit).
 */
export async function endGuestSession(params: GuestSessionParams): Promise<EndGuestSessionOutcome> {
  const { prisma, sessionToken } = params;
  const tokenHash = hashSessionToken(sessionToken);

  const participant = await prisma.participant.findFirst({
    where: { sessionTokenHash: tokenHash, type: 'anonymous' },
  });
  if (!participant) return { kind: 'not-found' };
  if (!participant.isActive) return { kind: 'ended' };

  const ended = await prisma.participant.updateMany({
    where: { id: participant.id, isActive: true },
    data: { isActive: false, isOnline: false, leftAt: new Date() },
  });
  if (ended.count === 0) return { kind: 'ended' };

  announceConversationLanguageChange({ kind: 'departure', conversationId: participant.conversationId });

  // #10468 — la place se libère sur le lien qui l'a comptée, lu comme aux
  // autres portes : la colonne d'abord, la session embarquée en repli.
  const shareLinkId = guestShareLinkId(participant);
  if (shareLinkId) {
    await prisma.conversationShareLink.updateMany({
      where: { id: shareLinkId, currentConcurrentUsers: { gt: 0 } },
      data: { currentConcurrentUsers: { decrement: 1 } },
    });
  }

  return { kind: 'ended' };
}
