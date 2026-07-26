import { Globe, Megaphone, Users } from 'lucide-react';
import type { Conversation } from '@meeshy/shared/types';
import { formatRelativeDate } from '@/utils/date-format';
import { getUserDisplayNameOrNull } from '@/utils/user-display-name';

type NameSource = Parameters<typeof getUserDisplayNameOrNull>[0];

/**
 * Obtenir seulement le nom de la conversation (sans date)
 */
export function getConversationNameOnly(
  conversation: Conversation,
  getOtherParticipantUser: () => unknown
): string {
  if (conversation.type !== 'direct') {
    return conversation.title || 'Groupe sans nom';
  }

  const participantUser = getOtherParticipantUser();
  if (participantUser) {
    // Résolution canonique du nom (displayName > firstName+lastName > username)
    // via le SSOT `getUserDisplayNameOrNull`. La chaîne inline précédente
    // préférait `username` au vrai nom → handles cryptiques pour un compte
    // ayant un prénom/nom mais aussi un username.
    return getUserDisplayNameOrNull(participantUser as NameSource) ?? 'Utilisateur';
  }

  return conversation.title || 'Conversation privée';
}

/**
 * Résout le nom d'affichage de l'expéditeur d'un message via le SSOT
 * (displayName > firstName+lastName > username). Retourne `null` si le message
 * n'a pas d'expéditeur ou qu'aucun nom n'est disponible — l'appelant décide du
 * fallback (i18n) à appliquer.
 */
export function getMessageSenderName(message: unknown): string | null {
  const sender = (message as { sender?: unknown } | null | undefined)?.sender;
  if (!sender) return null;
  return getUserDisplayNameOrNull(sender as NameSource);
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
  getOtherParticipantUser: () => unknown
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
  if (conversation.type === 'broadcast') return <Megaphone className="h-4 w-4" />;
  if (conversation.visibility === 'public') return <Globe className="h-4 w-4" />;
  if (conversation.type === 'group') return <Users className="h-4 w-4" />;
  if (conversation.type !== 'direct') return <Users className="h-4 w-4" />;
  return null;
}
