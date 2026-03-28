import type { User } from '@/types';
import type { UserPermissions } from '@meeshy/shared/types';
import type { LinkConversationData } from '@/services/link-conversation.service';

export const DEFAULT_FRONTEND_PERMISSIONS: UserPermissions = {
  canAccessAdmin: false,
  canManageUsers: false,
  canManageGroups: false,
  canManageConversations: false,
  canViewAnalytics: false,
  canModerateContent: false,
  canViewAuditLogs: false,
  canManageNotifications: false,
  canManageTranslations: false,
};

type CurrentUser = NonNullable<LinkConversationData['currentUser']>;
type LinkMember = LinkConversationData['members'][number];
type AnonymousParticipant = LinkConversationData['anonymousParticipants'][number];

export function mapCurrentUserToUser(currentUser: CurrentUser): User {
  const lang = currentUser.language || 'fr';
  return {
    id: currentUser.id,
    username: currentUser.username,
    firstName: currentUser.firstName,
    lastName: currentUser.lastName,
    displayName: currentUser.displayName || currentUser.username,
    email: '',
    role: 'USER' as const,
    permissions: DEFAULT_FRONTEND_PERMISSIONS,
    systemLanguage: lang,
    regionalLanguage: lang,
    autoTranslateEnabled: true,
    isOnline: true,
    lastActiveAt: new Date(),
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  } as User;
}

export function mapMemberToUser(member: LinkMember): User {
  return {
    id: member.user.id,
    username: member.user.username,
    firstName: member.user.firstName,
    lastName: member.user.lastName,
    displayName: member.user.displayName,
    email: '',
    avatar: member.user.avatar,
    role: 'USER' as const,
    permissions: DEFAULT_FRONTEND_PERMISSIONS,
    systemLanguage: 'fr',
    regionalLanguage: 'fr',
    autoTranslateEnabled: true,
    isOnline: member.user.isOnline,
    lastActiveAt: member.user.lastActiveAt ? new Date(member.user.lastActiveAt) : new Date(),
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  } as User;
}

export function mapAnonymousParticipantToUser(participant: AnonymousParticipant): User {
  const lang = participant.language || 'fr';
  return {
    id: participant.id,
    username: participant.username,
    firstName: participant.firstName,
    lastName: participant.lastName,
    displayName: participant.username,
    email: '',
    avatar: '',
    role: 'USER' as const,
    permissions: DEFAULT_FRONTEND_PERMISSIONS,
    systemLanguage: lang,
    regionalLanguage: lang,
    autoTranslateEnabled: true,
    isOnline: participant.isOnline,
    lastActiveAt: new Date(participant.lastActiveAt),
    isActive: true,
    createdAt: new Date(participant.joinedAt),
    updatedAt: new Date(participant.lastActiveAt),
  } as User;
}

export function mapParticipantsFromLinkData(
  data: LinkConversationData,
  isAnonymous: boolean,
): User[] {
  const participants: User[] = [];

  if (isAnonymous && data.currentUser) {
    participants.push(mapCurrentUserToUser(data.currentUser));
  }

  for (const member of data.members || []) {
    participants.push(mapMemberToUser(member));
  }

  const currentUserId = data.currentUser?.id;
  for (const anon of data.anonymousParticipants || []) {
    if (isAnonymous && anon.id === currentUserId) continue;
    participants.push(mapAnonymousParticipantToUser(anon));
  }

  return participants;
}

export function getAnonymousPermissionHints(link: LinkConversationData['link']): string[] {
  const hints: string[] = [];
  if (!link.allowAnonymousFiles) hints.push('Fichiers non autorisés');
  if (!link.allowAnonymousImages) hints.push('Images non autorisées');
  return hints;
}
