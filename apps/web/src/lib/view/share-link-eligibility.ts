import { hasMinimumMemberRole, MemberRole } from '@meeshy/shared/types/role-types';

import type { Conversation } from '@/lib/api/types';

/**
 * `canCreateShareLink` — miroir `ConversationListView.swift:904-911`
 * (§ 3.3 de la spécification, D-14) : un DIRECT n'a jamais de lien de
 * partage (410/403 côté passerelle sur `mintConversationShareLink`, il n'y a
 * rien à proposer) ; un GROUPE l'exige à partir de MODÉRATEUR ; toute autre
 * forme (public, global, broadcast) reste ouverte à tout membre.
 */
export function canCreateShareLink(conversation: Conversation): boolean {
  if (conversation.type === 'direct') return false;
  if (conversation.type === 'group') return hasMinimumMemberRole(conversation.currentUserRole ?? '', MemberRole.MODERATOR);
  return true;
}

export function eligibleForShareLink(conversations: readonly Conversation[]): readonly Conversation[] {
  return conversations.filter(canCreateShareLink);
}
