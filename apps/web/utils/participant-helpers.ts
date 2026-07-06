import type { Participant } from '@meeshy/shared/types/participant';
import { hasMinimumMemberRole, MemberRole, isGlobalAdmin } from '@meeshy/shared/types/role-types';
import { getUserInitials } from '@/lib/avatar-utils';
import { getUserDisplayName } from '@/utils/user-display-name';

export function isAnonymousParticipant(user: any): boolean {
  return user && (user.type === 'anonymous' || 'sessionToken' in user || 'shareLinkId' in user);
}

export function getParticipantDisplayName(user: { displayName?: string; firstName?: string; lastName?: string; username: string }): string {
  // Résolveur canonique unique (`user-display-name.ts`) : displayName (trimmé) >
  // firstName+lastName > username. Garantit que le nom et les initiales
  // (`getParticipantInitials` → `getUserInitials` → même résolveur) dérivent
  // d'une seule source — pas de réimplémentation locale sans trim.
  return getUserDisplayName(user, user.username);
}

export function getParticipantInitials(user: { displayName?: string; firstName?: string; lastName?: string; username: string }): string {
  return getUserInitials(user as any);
}

export function isParticipantModerator(role: string): boolean {
  return hasMinimumMemberRole(role.toLowerCase(), MemberRole.MODERATOR);
}
