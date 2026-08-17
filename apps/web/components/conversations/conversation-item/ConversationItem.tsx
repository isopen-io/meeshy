'use client';

import { useCallback, memo, useMemo } from 'react';
import { Pin } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { Conversation, SocketIOUser as User } from '@meeshy/shared/types';
import { getTagColor } from '@/utils/tag-colors';
import { formatConversationDate } from '@/utils/date-format';
import { ParticipantPresenceIndicator } from './ParticipantPresenceIndicator';
import { ConversationItemActions } from './ConversationItemActions';
import { useConversationItemActions } from './use-conversation-item-actions';
import { usePrefetchOnHover } from '@/hooks/use-prefetch-on-hover';
import { useI18n } from '@/hooks/use-i18n';
import {
  getConversationAvatar,
  getConversationAvatarUrl,
  getConversationIcon,
  getConversationNameOnly,
  getConversationCreatedDate,
  getMessageSenderName
} from './conversation-utils';
import { formatLastMessage } from './message-formatting';
import { getUserLanguagePreferences } from '@/utils/user-language-preferences';

interface ConversationItemProps {
  conversation: Conversation;
  isSelected: boolean;
  currentUser: User;
  onClick: () => void;
  onShowDetails?: (conversation: Conversation) => void;
  t: (key: string) => string;
  isPinned?: boolean;
  isMuted?: boolean;
  isArchived?: boolean;
  reaction?: string;
  tags?: string[];
  isMobile?: boolean;
}

export const ConversationItem = memo(function ConversationItem({
  conversation,
  isSelected,
  currentUser,
  onClick,
  onShowDetails,
  t,
  isPinned = false,
  isMuted = false,
  isArchived = false,
  reaction,
  tags = [],
  isMobile = false
}: ConversationItemProps) {
  // Store global des préférences de conversation (réactif, abonné à CETTE
  // conversation uniquement) + les six handlers d'action — extraits dans
  // `useConversationItemActions` par REV-4/B3 pour que la peau Lentille monte
  // EXACTEMENT les mêmes, jamais une copie. Précédence inchangée : le magasin
  // d'abord, les props en repli.
  const { t: tCommon } = useI18n('common');
  const {
    isPinned: localIsPinned,
    isMuted: localIsMuted,
    isArchived: localIsArchived,
    reaction: localReaction,
    onTogglePin: handleTogglePin,
    onToggleMute: handleToggleMute,
    onToggleArchive: handleToggleArchive,
    onSetReaction: handleSetReaction,
    onShowDetails: handleShowDetails,
    onShareConversation: handleShareConversation,
  } = useConversationItemActions({
    conversation,
    t,
    onShowDetails,
    isPinned,
    isMuted,
    isArchived,
    reaction,
  });

  // Prisme Linguistique de la ligne de liste (cycle 61). `getUserLanguagePreferences`
  // est le seul point d'entrée autorisé côté web — il délègue à
  // `resolveUserLanguagesOrdered` (@meeshy/shared) ET injecte la `deviceLocale`
  // en 4e priorité, ce qu'un appel direct au shared perdrait (cf. apps/web/CLAUDE.md).
  const preferredLanguages = useMemo(
    () => getUserLanguagePreferences(currentUser),
    [
      currentUser.systemLanguage,
      currentUser.regionalLanguage,
      currentUser.customDestinationLanguage,
      currentUser.deviceLocale
    ]
  );

  // Helper pour obtenir l'autre participant dans une conversation directe
  const getOtherParticipantUser = useCallback(() => {
    if (conversation.type !== 'direct') return null;
    if (!conversation.participants?.length) return null;

    // Stratégie 1: trouver par userId différent du current user
    let otherParticipant = conversation.participants.find(p => {
      const participantUserId = p.userId ?? (p as unknown).user?.id;
      return participantUserId && participantUserId !== currentUser?.id;
    });

    // Stratégie 2: si currentUser.id est undefined, prendre le premier participant
    // qui n'est pas le seul (pour les DMs, il y a toujours 2 participants)
    if (!otherParticipant && conversation.participants.length >= 2) {
      otherParticipant = conversation.participants[1];
    }

    // Stratégie 3: s'il n'y a qu'un seul participant, l'utiliser
    if (!otherParticipant && conversation.participants.length === 1) {
      otherParticipant = conversation.participants[0];
    }

    if (!otherParticipant) return null;

    // Return nested user if available, otherwise build user-like object from participant
    return (otherParticipant as unknown).user ?? {
      id: otherParticipant.userId,
      displayName: otherParticipant.displayName,
      username: (otherParticipant as unknown).nickname ?? otherParticipant.displayName,
      avatar: (otherParticipant as unknown).avatar,
    };
  }, [conversation, currentUser]);

  const conversationName = getConversationNameOnly(conversation, getOtherParticipantUser);
  const conversationAvatar = getConversationAvatar(conversationName, getConversationCreatedDate(conversation, t));
  const avatarUrl = getConversationAvatarUrl(conversation, getOtherParticipantUser);
  const icon = getConversationIcon(conversation);

  const { onMouseEnter: prefetchOnMouseEnter, onMouseLeave: prefetchOnMouseLeave } = usePrefetchOnHover(conversation.id);

  const formatTime = useCallback((date: Date | string) => {
    return formatConversationDate(date, { t });
  }, [t]);

  const getSenderName = useCallback((message: unknown) => {
    const sender = (message as { sender?: unknown } | null | undefined)?.sender;
    if (!sender) return null;

    // Nom canonique via le SSOT (displayName > firstName+lastName > username) ;
    // fallback i18n uniquement si l'expéditeur existe mais n'a aucun nom.
    return getMessageSenderName(message) ?? tCommon('user');
  }, [tCommon]);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } }}
      onMouseEnter={prefetchOnMouseEnter}
      onMouseLeave={prefetchOnMouseLeave}
      className={cn(
        "group flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-colors",
        "hover:bg-accent/50 outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
        isSelected && "bg-primary/10 hover:bg-primary/20"
      )}
    >
      {/* Avatar */}
      <div className="relative flex-shrink-0">
        <Avatar className="h-12 w-12">
          <AvatarImage src={avatarUrl} />
          <AvatarFallback className="bg-primary/10 text-primary font-semibold">
            {icon || conversationAvatar}
          </AvatarFallback>
        </Avatar>
        {/* Indicateur de présence - pour les conversations directes.
            Feuille abonnée seule au user store : la row ne re-rend plus sur les ticks de présence */}
        {conversation.type === 'direct' && (() => {
          const participantUser = getOtherParticipantUser();
          if (participantUser) {
            return (
              <ParticipantPresenceIndicator
                userId={participantUser.id}
                fallbackUser={participantUser}
                size="md"
                className="absolute -bottom-0.5 -right-0.5"
              />
            );
          }
          return null;
        })()}
      </div>

      {/* Contenu */}
      <div className="flex-1 min-w-0">
        {/* Tags colorés au-dessus du titre */}
        {tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-1">
            {tags.slice(0, 3).map((tag) => {
              const colors = getTagColor(tag);
              return (
                <Badge
                  key={tag}
                  variant="outline"
                  className={cn(
                    "px-1.5 py-0 h-4 text-[10px] font-medium border",
                    colors.bg,
                    colors.text,
                    colors.border
                  )}
                >
                  {tag}
                </Badge>
              );
            })}
            {tags.length > 3 && (
              <Badge
                variant="outline"
                className="px-1.5 py-0 h-4 text-[10px] font-medium border border-muted-foreground/20 bg-muted/50 text-muted-foreground"
              >
                +{tags.length - 3}
              </Badge>
            )}
          </div>
        )}

        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-1.5 min-w-0">
            {localIsPinned && (
              <Pin className="h-3.5 w-3.5 text-primary flex-shrink-0 fill-current" />
            )}
            <h3 className="font-semibold text-sm truncate">
              {conversationName}
            </h3>
          </div>
          {conversation.lastMessage && (
            <span className="text-xs text-muted-foreground flex-shrink-0">
              {formatTime(conversation.lastMessage.createdAt)}
            </span>
          )}
        </div>

        {conversation.lastMessage && (
          <p className="text-sm text-muted-foreground truncate mt-0.5">
            {getSenderName(conversation.lastMessage) && (
              <span className="font-medium">{getSenderName(conversation.lastMessage)}: </span>
            )}
            {formatLastMessage(conversation.lastMessage, {
              translations: conversation.lastMessageTranslations,
              originalLanguage: conversation.lastMessageOriginalLanguage,
              preferredLanguages
            })}
          </p>
        )}
      </div>

      {/* Badge de messages non lus */}
      {conversation.unreadCount !== undefined && conversation.unreadCount > 0 && (
        <Badge
          variant="destructive"
          className="ml-2 flex-shrink-0 h-5 min-w-[20px] px-1.5"
        >
          {conversation.unreadCount > 99 ? '99+' : conversation.unreadCount}
        </Badge>
      )}

      {/* Menu Show More */}
      <ConversationItemActions
        conversation={conversation}
        isPinned={localIsPinned}
        isMuted={localIsMuted}
        isArchived={localIsArchived}
        reaction={localReaction}
        isMobile={isMobile}
        onTogglePin={handleTogglePin}
        onToggleMute={handleToggleMute}
        onToggleArchive={handleToggleArchive}
        onSetReaction={handleSetReaction}
        onShowDetails={handleShowDetails}
        onShareConversation={handleShareConversation}
        t={t}
      />
    </div>
  );
});
