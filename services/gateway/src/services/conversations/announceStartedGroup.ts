/**
 * #14644 (B) — un groupe neuf ne s'annonce aux invités qu'au PREMIER message.
 *
 * À la création (`POST /conversations`), un groupe naît comme un tête-à-tête :
 * `firstMessageSentAt: null`, seul son créateur reçoit `conversation:new`, la
 * liste des invités le tait (`emptyDirectVisibility`) et aucune invitation ne
 * part. Le premier message bascule `firstMessageSentAt` (`runMessagePostSaveEffects`)
 * et appelle cette unité : `conversation:new` part vers chaque invité, et la
 * notification d'invitation vers ceux qui sont entrés directement — une demande
 * en attente (#14107) attend dans la boîte, comme à la création.
 *
 * Un groupe d'avant ce lot n'a pas le champ : la bascule (`updateMany` sur
 * `firstMessageSentAt: null`) ne l'apparie jamais, il n'est donc jamais annoncé
 * une seconde fois.
 */
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { generateDefaultConversationTitle } from '@meeshy/shared/utils/conversation-helpers';
import { isMemberCreator } from '@meeshy/shared/types/role-types';
import { enhancedLogger } from '../../utils/logger-enhanced';
import type { ServerEmitIO } from '../../socketio/serverEmit';
import { announceConversationNew } from './obsoleteCapability';

const logger = enhancedLogger.child({ module: 'AnnounceStartedGroup' });

export type StartedGroupInviteNotifier = {
  createConversationInviteNotification(params: {
    invitedUserId: string;
    inviterId: string;
    inviterUsername?: string;
    inviterAvatar?: string;
    conversationId: string;
    conversationTitle?: string;
    conversationType: string;
  }): Promise<unknown>;
};

export type AnnounceStartedGroupDeps = {
  readonly prisma: Pick<PrismaClient, 'conversation' | 'participant' | 'user'>;
  readonly io: ServerEmitIO | null | undefined;
  readonly notificationService: StartedGroupInviteNotifier | null | undefined;
};

/** Le port que `runMessagePostSaveEffects` appelle quand un groupe vient d'être démarré. */
export type StartedGroupAnnouncer = {
  announceStartedGroup(conversationId: string): Promise<void>;
};

export function startedGroupAnnouncer(deps: () => AnnounceStartedGroupDeps): StartedGroupAnnouncer {
  return { announceStartedGroup: (conversationId) => announceStartedGroup(deps(), conversationId) };
}

export async function announceStartedGroup(deps: AnnounceStartedGroupDeps, conversationId: string): Promise<void> {
  const conversation = await deps.prisma.conversation.findUnique({
    where: { id: conversationId },
    select: {
      id: true,
      type: true,
      title: true,
      createdAt: true,
      participants: {
        where: { isActive: true },
        select: {
          userId: true,
          role: true,
          messageRequestAt: true,
          user: { select: { id: true, displayName: true, username: true, avatar: true, firstName: true, lastName: true } },
        },
      },
    },
  });
  if (!conversation || conversation.type !== 'group') return;

  const members = conversation.participants.filter((participant): participant is typeof participant & { userId: string } => typeof participant.userId === 'string');
  const creator = members.find((participant) => isMemberCreator(participant.role ?? 'member'));
  if (!creator) return;
  const invitees = members.filter((participant) => participant.userId !== creator.userId);
  if (invitees.length === 0) return;

  const title = conversation.title && conversation.title.trim() !== ''
    ? conversation.title
    : generateDefaultConversationTitle(
        members.map((participant) => ({
          id: participant.userId,
          displayName: participant.user?.displayName,
          username: participant.user?.username,
          firstName: participant.user?.firstName,
          lastName: participant.user?.lastName,
        })),
        creator.userId,
      );

  const payload = {
    conversationId: conversation.id,
    conversationType: conversation.type,
    title,
    creatorId: creator.userId,
    participantIds: members.map((participant) => participant.userId),
    createdAt: conversation.createdAt.toISOString(),
  };
  if (deps.io) {
    await announceConversationNew(deps.prisma, {
      io: deps.io,
      recipientIds: invitees.map((invitee) => invitee.userId),
      payload,
      onError: (error) => logger.warn('conversation:new emission failed', { conversationId: conversation.id, error }),
    });
  }

  const notifier = deps.notificationService;
  if (!notifier) return;
  const inviterName = creator.user?.displayName || creator.user?.username;
  await Promise.all(
    invitees
      .filter((invitee) => !invitee.messageRequestAt)
      .map((invitee) =>
        notifier
          .createConversationInviteNotification({
            invitedUserId: invitee.userId,
            inviterId: creator.userId,
            inviterUsername: inviterName ?? undefined,
            inviterAvatar: creator.user?.avatar ?? undefined,
            conversationId: conversation.id,
            conversationTitle: title,
            conversationType: conversation.type,
          })
          .catch((error: unknown) => logger.error('started group invitation failed', { conversationId, error })),
      ),
  );
}

/**
 * #14644 — un APPEL dans un groupe silencieux le démarre d'abord, par la même
 * bascule gardée qu'un premier message et la même annonce : les invités
 * reçoivent `conversation:new` (et l'invitation) AVANT que l'appel ne sonne,
 * donc ne sont jamais appelés depuis un groupe qu'ils ne voient pas. Un groupe
 * déjà démarré, un groupe d'avant #14644 (champ absent) et un tête-à-tête ne
 * sont pas touchés. Rend `true` si la bascule a été gagnée ici.
 */
export async function startSilentGroup(deps: AnnounceStartedGroupDeps, conversationId: string): Promise<boolean> {
  const flipped = await deps.prisma.conversation.updateMany({
    where: { id: conversationId, type: 'group', firstMessageSentAt: null },
    data: { firstMessageSentAt: new Date() },
  });
  if (flipped.count !== 1) return false;
  await announceStartedGroup(deps, conversationId);
  return true;
}
