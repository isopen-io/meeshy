import { PrismaClient } from '@meeshy/shared/prisma/client';
import { getConnectedUser, type SocketUser } from './socket-helpers';
import type { ConversationJoinErrorReason } from '@meeshy/shared/utils/conversation-join-error';

export type ParticipantResolution = {
  participantId: string;
  userId: string;
  isAnonymous: boolean;
  displayName: string;
};

/**
 * Les trois motifs de refus que ce module peut établir — le sous-ensemble de
 * `ConversationJoinErrorReason` qui parle d'APPARTENANCE (`not_a_member`,
 * `banned`, `no_longer_member`). Les quatre autres motifs de
 * `conversation:join` (limite de débit, authentification, payload invalide,
 * erreur serveur) n'ont pas d'équivalent ici : ce module ne les rencontre
 * jamais, il ne fait qu'une lecture Prisme.
 */
export type MembershipDenialReason = Extract<
  ConversationJoinErrorReason,
  'not_a_member' | 'banned' | 'no_longer_member'
>;

export async function resolveParticipant(opts: {
  prisma: PrismaClient;
  userIdOrToken: string;
  conversationId: string;
  connectedUsers: Map<string, SocketUser>;
}): Promise<ParticipantResolution | null> {
  const { prisma, userIdOrToken, conversationId, connectedUsers } = opts;

  const userResult = getConnectedUser(userIdOrToken, connectedUsers);
  if (!userResult) return null;

  const { user, realUserId } = userResult;

  if (user.isAnonymous) {
    // An anonymous participant is bound to exactly ONE conversation
    // (Participant row created when joining a share link; the socket joins
    // only that conversation room — see AuthHandler._authenticateAnonymousUser).
    // Verify the participant is active in the REQUESTED conversation before
    // trusting the in-memory identity, mirroring the registered path below.
    // Without this check an anonymous socket could pass an arbitrary
    // conversationId to any participant-gated handler (typing:start, reactions,
    // …) and broadcast into a room it does not belong to. The DB read also
    // re-checks `isActive`, so an anon removed/banned since connect is rejected.
    const participantId = user.participantId || user.id;
    const anonParticipant = await prisma.participant.findFirst({
      where: { id: participantId, conversationId, isActive: true },
      select: { id: true, displayName: true, nickname: true },
    });

    if (!anonParticipant) return null;

    return {
      participantId: anonParticipant.id,
      userId: realUserId,
      isAnonymous: true,
      displayName: anonParticipant.nickname || anonParticipant.displayName || user.displayName || 'Anonymous User',
    };
  }

  const userId = user.userId || realUserId;

  const participant = await prisma.participant.findFirst({
    where: { userId, conversationId, isActive: true },
    select: { id: true, displayName: true, nickname: true },
  });

  if (!participant) return null;

  return {
    participantId: participant.id,
    userId,
    isAnonymous: false,
    displayName: participant.nickname || participant.displayName || user.displayName || 'Unknown User',
  };
}

/**
 * Pourquoi `resolveParticipant` retombe à `null` — motif ÉTABLI, jamais
 * deviné. `resolveParticipant` filtre `isActive: true` dans sa requête : un
 * `null` de sa part ne dit pas s'il n'y a AUCUNE ligne `Participant`, ou une
 * ligne bannie / partie. Un appelant qui doit signaler le refus au client
 * (`conversation:join-error`, § conversation-join-error.ts) a besoin du
 * discriminant, pas seulement du refus.
 *
 * Reproduit volontairement les trois branches de
 * `ConversationHandler.handleConversationJoin` (même ordre : introuvable →
 * banni → parti/inactif) plutôt que de les partager : `handleConversationJoin`
 * a sa propre requête pour l'utilisateur anonyme (`participant.findFirst` par
 * `id`), déjà couverte par ses propres témoins, et la faire dépendre de ce
 * module coûterait un risque de régression sans bénéfice pour cette issue.
 *
 * N'appeler qu'APRÈS un `resolveParticipant` qui a rendu `null` — cette
 * fonction ne sert qu'à NOMMER un refus déjà constaté, jamais à décider seule
 * de l'admission.
 */
export async function resolveMembershipDenialReason(opts: {
  prisma: PrismaClient;
  conversationId: string;
  isAnonymous: boolean;
  /** `Participant.id` du socket anonyme — ignoré pour un utilisateur inscrit. */
  anonymousParticipantId?: string;
  /** `User.id` de l'utilisateur inscrit — ignoré pour un socket anonyme. */
  userId?: string;
}): Promise<MembershipDenialReason> {
  const { prisma, conversationId, isAnonymous, anonymousParticipantId, userId } = opts;

  if (isAnonymous) {
    // Un participant anonyme est lié à EXACTEMENT une conversation (la ligne
    // créée en rejoignant un lien partagé) : `handleConversationJoin` ne
    // distingue pas banni/parti pour ce cas, il n'y a qu'un seul motif.
    const participant = await prisma.participant.findFirst({
      where: { id: anonymousParticipantId, conversationId },
      select: { id: true },
    });
    return participant ? 'no_longer_member' : 'not_a_member';
  }

  const participant = await prisma.participant.findFirst({
    where: { userId, conversationId },
    select: { bannedAt: true, leftAt: true, isActive: true },
  });

  if (!participant) return 'not_a_member';
  if (participant.bannedAt) return 'banned';
  return 'no_longer_member';
}

export async function resolveParticipantFromMessage(opts: {
  prisma: PrismaClient;
  userIdOrToken: string;
  messageId: string;
  connectedUsers: Map<string, SocketUser>;
}): Promise<ParticipantResolution | null> {
  const { prisma, messageId } = opts;

  const message = await prisma.message.findUnique({
    where: { id: messageId },
    select: { conversationId: true },
  });

  if (!message) return null;

  return resolveParticipant({
    prisma: opts.prisma,
    userIdOrToken: opts.userIdOrToken,
    conversationId: message.conversationId,
    connectedUsers: opts.connectedUsers,
  });
}
