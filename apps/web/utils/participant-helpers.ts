import type { Participant } from '@meeshy/shared/types/participant';
import { hasMinimumMemberRole, MemberRole, isGlobalAdmin } from '@meeshy/shared/types/role-types';
import { getUserInitials } from '@/lib/avatar-utils';

export function isAnonymousParticipant(user: any): boolean {
  return user && (user.type === 'anonymous' || 'sessionToken' in user || 'shareLinkId' in user);
}

export function getParticipantDisplayName(user: { displayName?: string; firstName?: string; lastName?: string; username: string }): string {
  return user.displayName ||
    `${user.firstName || ''} ${user.lastName || ''}`.trim() ||
    user.username;
}

export function getParticipantInitials(user: { displayName?: string; firstName?: string; lastName?: string; username: string }): string {
  return getUserInitials(user as any);
}

export function isParticipantModerator(role: string): boolean {
  return hasMinimumMemberRole(role.toLowerCase(), MemberRole.MODERATOR);
}
