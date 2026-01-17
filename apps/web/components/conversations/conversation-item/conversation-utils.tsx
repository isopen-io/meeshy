import { Globe, Users } from 'lucide-react';
import type { Conversation } from '@meeshy/shared/types';
import { formatRelativeDate } from '@/utils/date-format';

/**
 * Obtenir seulement le nom de la conversation (sans date)
 */
export function getConversationNameOnly(
  conversation: Conversation,
  getOtherParticipantUser: () => any
): string {
  if (conversation.type !== 'direct') {
    return conversation.title || 'Groupe sans nom';
  }

  const participantUser = getOtherParticipantUser();
  if (participantUser) {
    const userName = participantUser.displayName ||
                    participantUser.username ||
                    (participantUser.firstName && participantUser.lastName
                      ? `${participantUser.firstName} ${participantUser.lastName}`.trim()
                      : participantUser.firstName || participantUser.lastName) ||
                    'Utilisateur';
    return userName;
  }

  return conversation.title || 'Conversation privée';
}

/**
 * Obtenir la date de création formatée pour les conversations directes
 */
export function getConversationCreatedDate(
  conversation: Conversation,
  t: (key: string) => string
): string | null {
  if (conversation.type === 'direct' && conversation.createdAt) {
    return formatRelativeDate(conversation.createdAt, { t });
  }
  return null;
}

/**
 * Obtenir l'avatar de la conversation (initiales)
 */
export function getConversationAvatar(name: string, date: string | null): string {
  const fullName = date ? `${name} (${date})` : name;
  return fullName.slice(0, 2).toUpperCase();
}

/**
 * Obtenir l'URL de l'avatar de la conversation
 */
export function getConversationAvatarUrl(
  conversation: Conversation,
  getOtherParticipantUser: () => any
): string | undefined {
  if (conversation.type === 'direct') {
    const participantUser = getOtherParticipantUser();
    return participantUser?.avatar;
  }
  return conversation.image || conversation.avatar;
}

/**
 * Obtenir l'icône de la conversation selon son type
 */
export function getConversationIcon(conversation: Conversation): React.ReactNode | null {
  if (conversation.visibility === 'public') return <Globe className="h-4 w-4" />;
  if (conversation.type === 'broadcast') return <Users className="h-4 w-4" />;
  if (conversation.type === 'group') return <Users className="h-4 w-4" />;
  if (conversation.type !== 'direct') return <Users className="h-4 w-4" />;
  return null;
}
