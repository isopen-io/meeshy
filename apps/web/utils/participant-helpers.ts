import type { Participant } from '@meeshy/shared/types/participant';
import { hasMinimumMemberRole, MemberRole, isGlobalAdmin } from '@meeshy/shared/types/role-types';
import { getUserInitials } from '@/lib/avatar-utils';
import { getUserDisplayName } from '@/utils/user-display-name';
import { isAnonymousSender } from '@meeshy/shared/utils/sender-identity';

/**
 * Ce participant a-t-il un compte ?
 *
 * Délègue à `isAnonymousSender` (`@meeshy/shared/utils/sender-identity`), la
 * réponse unique du produit — sans quoi le web porterait un quatrième
 * discriminant à côté de `type`, `isMeeshyer` et `isAnonymous`, et c'est
 * exactement cette dispersion qui avait laissé les branches `<Ghost />` de la
 * vue Bulles éteintes derrière un `const isAnonymous = false`.
 *
 * Les deux replis de forme restent : certaines charges utiles de participant
 * portent `sessionToken` / `shareLinkId` sans porter `type`.
 */
export function isAnonymousParticipant(user: any): boolean {
  if (!user) return false;
  return isAnonymousSender(user) || 'sessionToken' in user || 'shareLinkId' in user;
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
