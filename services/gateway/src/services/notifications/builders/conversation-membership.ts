/**
 * Les bâtisseurs d'APPARTENANCE à une conversation — extraits de
 * `NotificationService.ts` (#7632, budget de taille).
 *
 * Une responsabilité : dire à un membre ce qui change dans la COMPOSITION
 * d'une conversation. Invitation, ajout, exclusion (la sienne et celle d'un
 * tiers), changement de rôle, départ.
 *
 * La distinction qui gouverne ce module, et qu'aucun nom de méthode ne dit
 * seul : une nouvelle qui vise le destinataire LUI-MÊME perce le mute
 * (`createRemovedFromConversationNotification`), une nouvelle AMBIANTE sur un
 * tiers ne le perce pas (`createMemberRemovedNotification`,
 * `createMemberLeftNotification`). Les deux se ressemblent ligne à ligne ;
 * c'est le `isConversationMutedFor` en tête qui les sépare.
 *
 * L'ARRIVÉE d'un membre est un éventail (`../fanout/member-joined.ts`) : elle
 * écrit à tous les membres d'un coup, pas à un destinataire nommé.
 */
import type { Notification } from '@meeshy/shared/types/notification';
import { notificationString } from '@meeshy/shared/utils/notification-strings';
import type { NotificationBuilderDependencies } from './dependencies';


export async function createConversationInviteNotification(
  deps: NotificationBuilderDependencies,
  params: {
    invitedUserId: string;
    inviterId: string;
    inviterUsername?: string;
    inviterAvatar?: string;
    conversationId: string;
    conversationTitle?: string;
    conversationType: 'direct' | 'group' | 'public' | 'global' | 'broadcast' | string;
  }
): Promise<Notification | null> {
  const type = params.conversationType === 'direct' ? 'new_conversation_direct' : 'new_conversation_group';

  // Si on n'a pas les infos de l'inviteur, on les récupère
  let actor = {
    id: params.inviterId,
    username: params.inviterUsername || 'User',
    displayName: params.inviterUsername || 'User',
    avatar: params.inviterAvatar
  };

  if (!params.inviterUsername) {
    const user = await deps.prisma.user.findUnique({
      where: { id: params.inviterId },
      select: { username: true, displayName: true, avatar: true }
    });
    if (user) {
      actor.username = user.username;
      actor.displayName = user.displayName || user.username;
      actor.avatar = user.avatar || undefined;
    }
  }

  const lang = await deps.resolveRecipientLang(params.invitedUserId);
  const content = params.conversationType === 'direct'
    ? notificationString(lang, 'invitation.direct', { actor: actor.displayName })
    : notificationString(lang, 'invitation.group', { title: params.conversationTitle || '' });

  return deps.createNotification({
    userId: params.invitedUserId,
    type: type as any,
    priority: 'normal',
    content,
    actor,
    context: {
      conversationId: params.conversationId,
      conversationTitle: params.conversationTitle,
      conversationType: params.conversationType as any,
    },
    metadata: { action: 'view_conversation' },
  });
}

export async function createAddedToConversationNotification(
  deps: NotificationBuilderDependencies,
  params: {
    recipientUserId: string;
    addedByUserId: string;
    conversationId: string;
  }
): Promise<Notification | null> {
  const actor = await deps.prisma.user.findUnique({
    where: { id: params.addedByUserId },
    select: { username: true, displayName: true, avatar: true },
  });
  if (!actor) return null;

  const conversation = await deps.prisma.conversation.findUnique({
    where: { id: params.conversationId },
    select: { title: true, type: true },
  });

  const lang = await deps.resolveRecipientLang(params.recipientUserId);

  return deps.createNotification({
    userId: params.recipientUserId,
    type: 'added_to_conversation',
    priority: 'normal',
    content: conversation?.type === 'direct'
      ? notificationString(lang, 'group.newContact')
      : notificationString(lang, 'group.added', { title: conversation?.title || '' }),
    actor: {
      id: params.addedByUserId,
      username: actor.username,
      displayName: actor.displayName,
      avatar: actor.avatar,
    },
    context: {
      conversationId: params.conversationId,
      conversationTitle: conversation?.title,
      conversationType: conversation?.type as any,
    },
    metadata: { action: 'view_conversation' },
  });
}

// ==============================================
// REMOVED_FROM_CONVERSATION
// ==============================================

export async function createRemovedFromConversationNotification(
  deps: NotificationBuilderDependencies,
  params: {
    recipientUserId: string;
    removedByUserId: string;
    conversationId: string;
  }
): Promise<Notification | null> {
  const actor = await deps.prisma.user.findUnique({
    where: { id: params.removedByUserId },
    select: { username: true, displayName: true, avatar: true },
  });
  if (!actor) return null;

  const conversation = await deps.prisma.conversation.findUnique({
    where: { id: params.conversationId },
    select: { title: true, type: true },
  });

  return deps.createNotification({
    userId: params.recipientUserId,
    type: 'removed_from_conversation',
    priority: 'normal',
    content: '',
    actor: {
      id: params.removedByUserId,
      username: actor.username,
      displayName: actor.displayName,
      avatar: actor.avatar,
    },
    context: {
      conversationId: params.conversationId,
      conversationTitle: conversation?.title,
      conversationType: conversation?.type as any,
    },
    metadata: { action: 'view_details' },
  });
}

// ==============================================
// MEMBER_REMOVED (notifie les autres membres)
// ==============================================

export async function createMemberRemovedNotification(
  deps: NotificationBuilderDependencies,
  params: {
    recipientUserId: string;
    removedByUserId: string;
    conversationId: string;
  }
): Promise<Notification | null> {
  // Exclusion d'un TIERS — ambiant. À ne pas confondre avec
  // `createRemovedFromConversationNotification`, qui annonce au destinataire
  // sa PROPRE exclusion et perce donc le mute.
  if (await deps.isConversationMutedFor(params.recipientUserId, params.conversationId, 'member_removed')) {
    return null;
  }

  const actor = await deps.prisma.user.findUnique({
    where: { id: params.removedByUserId },
    select: { username: true, displayName: true, avatar: true },
  });
  if (!actor) return null;

  const conversation = await deps.prisma.conversation.findUnique({
    where: { id: params.conversationId },
    select: { title: true, type: true },
  });

  return deps.createNotification({
    userId: params.recipientUserId,
    type: 'member_removed',
    priority: 'normal',
    content: '',
    actor: {
      id: params.removedByUserId,
      username: actor.username,
      displayName: actor.displayName,
      avatar: actor.avatar,
    },
    context: {
      conversationId: params.conversationId,
      conversationTitle: conversation?.title,
      conversationType: conversation?.type as any,
    },
    metadata: { action: 'view_conversation' },
  });
}

// ==============================================
// MEMBER_ROLE_CHANGED / PROMOTED / DEMOTED
// ==============================================

export async function createMemberRoleChangedNotification(
  deps: NotificationBuilderDependencies,
  params: {
    recipientUserId: string;
    changedByUserId: string;
    conversationId: string;
    newRole: 'ADMIN' | 'MODERATOR' | 'MEMBER';
    previousRole: string;
  }
): Promise<Notification | null> {
  const actor = await deps.prisma.user.findUnique({
    where: { id: params.changedByUserId },
    select: { username: true, displayName: true, avatar: true },
  });
  if (!actor) return null;

  const conversation = await deps.prisma.conversation.findUnique({
    where: { id: params.conversationId },
    select: { title: true, type: true },
  });

  const roleHierarchy: Record<string, number> = { MEMBER: 0, MODERATOR: 1, ADMIN: 2, CREATOR: 3 };
  const oldLevel = roleHierarchy[params.previousRole] ?? 0;
  const newLevel = roleHierarchy[params.newRole] ?? 0;
  const type = newLevel > oldLevel ? 'member_promoted' : newLevel < oldLevel ? 'member_demoted' : 'member_role_changed';

  return deps.createNotification({
    userId: params.recipientUserId,
    type,
    priority: 'normal',
    content: '',
    actor: {
      id: params.changedByUserId,
      username: actor.username,
      displayName: actor.displayName,
      avatar: actor.avatar,
    },
    context: {
      conversationId: params.conversationId,
      conversationTitle: conversation?.title,
      conversationType: conversation?.type as any,
    },
    metadata: {
      action: 'view_conversation',
      newRole: params.newRole,
      previousRole: params.previousRole,
    },
  });
}

// ==============================================
// MEMBER_LEFT
// ==============================================

export async function createMemberLeftNotification(
  deps: NotificationBuilderDependencies,
  params: {
    recipientUserId: string;
    memberUserId: string;
    conversationId: string;
  }
): Promise<Notification | null> {
  // Départ d'un TIERS — ambiant, comme l'arrivée et l'exclusion.
  if (await deps.isConversationMutedFor(params.recipientUserId, params.conversationId, 'member_left')) {
    return null;
  }

  const member = await deps.prisma.user.findUnique({
    where: { id: params.memberUserId },
    select: { username: true, displayName: true, avatar: true },
  });
  if (!member) return null;

  const conversation = await deps.prisma.conversation.findUnique({
    where: { id: params.conversationId },
    select: { title: true, type: true },
  });

  return deps.createNotification({
    userId: params.recipientUserId,
    type: 'member_left',
    priority: 'low',
    content: '',
    actor: {
      id: params.memberUserId,
      username: member.username,
      displayName: member.displayName,
      avatar: member.avatar,
    },
    context: {
      conversationId: params.conversationId,
      conversationTitle: conversation?.title,
      conversationType: conversation?.type as any,
    },
    metadata: { action: 'view_conversation' },
  });
}
