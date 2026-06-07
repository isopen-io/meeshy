'use client';

import { useCallback, memo } from 'react';
import { Pin } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { Conversation, SocketIOUser as User } from '@meeshy/shared/types';
import { useConversationPreferencesStore } from '@/stores/conversation-preferences-store';
import { getTagColor } from '@/utils/tag-colors';
import { toast } from 'sonner';
import { OnlineIndicator } from '@/components/ui/online-indicator';
import { getUserStatus } from '@/lib/user-status';
import { formatConversationDate } from '@/utils/date-format';
import { useUserStore } from '@/stores/user-store';
import { ConversationItemActions } from './ConversationItemActions';
import { usePrefetchOnHover } from '@/hooks/use-prefetch-on-hover';
import {
  getConversationAvatar,
  getConversationAvatarUrl,
  getConversationIcon,
  getConversationNameOnly,
  getConversationCreatedDate
} from './conversation-utils';
import { formatLastMessage } from './message-formatting';

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
  // Store global des préférences de conversation (réactif)
  const prefsStore = useConversationPreferencesStore();
  const storePrefs = prefsStore.preferencesMap.get(conversation.id);

  // Utiliser les valeurs du store si disponibles, sinon les props
  const localIsPinned = storePrefs?.isPinned ?? isPinned;
  const localIsMuted = storePrefs?.isMuted ?? isMuted;
  const localIsArchived = storePrefs?.isArchived ?? isArchived;
  const localReaction = storePrefs?.reaction ?? reaction;

  // Store global des utilisateurs (statuts en temps réel)
  const userStore = useUserStore();
  // Actions du menu - utilisent le store pour la réactivité
  const handleTogglePin = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await prefsStore.togglePin(conversation.id, !localIsPinned);
      toast.success(t(localIsPinned ? 'conversations.unpinned' : 'conversations.pinned'));
    } catch (error) {
      console.error('Error toggling pin:', error);
      toast.error(t('conversations.pinError'));
    }
  }, [conversation.id, localIsPinned, prefsStore, t]);

  const handleToggleMute = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await prefsStore.toggleMute(conversation.id, !localIsMuted);
      toast.success(t(localIsMuted ? 'conversations.unmuted' : 'conversations.muted'));
    } catch (error) {
      console.error('Error toggling mute:', error);
      toast.error(t('conversations.muteError'));
    }
  }, [conversation.id, localIsMuted, prefsStore, t]);

  const handleToggleArchive = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await prefsStore.toggleArchive(conversation.id, !localIsArchived);
      toast.success(t(localIsArchived ? 'conversations.unarchived' : 'conversations.archived'));
    } catch (error) {
      console.error('Error toggling archive:', error);
      toast.error(t('conversations.archiveError'));
    }
  }, [conversation.id, localIsArchived, prefsStore, t]);

  const handleSetReaction = useCallback(async (e: React.MouseEvent, emoji: string) => {
    e.stopPropagation();
    try {
      const newReaction = localReaction === emoji ? null : emoji;
      await prefsStore.setReaction(conversation.id, newReaction);
      toast.success(newReaction ? `${emoji}` : t('conversations.reactionRemoved'));
    } catch (error) {
      console.error('Error setting reaction:', error);
      toast.error(t('conversations.reactionError'));
    }
  }, [conversation.id, localReaction, prefsStore, t]);

  const handleShowDetails = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onShowDetails?.(conversation);
  }, [conversation, onShowDetails]);

  const handleShareConversation = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();
    const url = `${window.location.origin}/conversations/${conversation.id}`;
    const shareText = t('conversationHeader.shareMessage');
    const fullMessage = `${shareText}\n\n${url}`;

    try {
      if (navigator.share) {
        await navigator.share({
          text: fullMessage,
        });
      } else {
        await navigator.clipboard.writeText(fullMessage);
        toast.success(t('conversationHeader.linkCopied'));
      }
    } catch (error: unknown) {
      if (error.name === 'AbortError') {
        return;
      }
      console.error('Error sharing:', error);
      toast.error(t('conversationHeader.linkCopyError'));
    }
  }, [conversation.id, t]);

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
    const sender = message?.sender;
    const isAnonymous = false;

    if (!sender) return null;

    let senderName = sender.displayName ||
                     sender.username ||
                     (sender.firstName || sender.lastName
                       ? `${sender.firstName || ''} ${sender.lastName || ''}`.trim()
                       : null);

    if (!senderName) {
      senderName = isAnonymous ? 'Anonyme' : 'Utilisateur';
    }

    return isAnonymous ? `${senderName} (anonyme)` : senderName;
  }, []);

  const unreadLabel = conversation.unreadCount && conversation.unreadCount > 0
    ? `, ${conversation.unreadCount} ${t('conversations.unreadMessages') || 'unread'}`
    : '';
  const ariaLabel = `${conversationName}${unreadLabel}${localIsPinned ? `, ${t('conversations.pinned') || 'pinned'}` : ''}${localIsMuted ? `, ${t('conversations.muted') || 'muted'}` : ''}`;

  return (
    <div
      role="button"
      tabIndex={0}
      aria-selected={isSelected}
      aria-label={ariaLabel}
      onClick={onClick}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } }}
      onMouseEnter={prefetchOnMouseEnter}
      onMouseLeave={prefetchOnMouseLeave}
      className={cn(
        "group flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-colors",
        "hover:bg-accent/50",
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
        {/* Indicateur de présence - pour les conversations directes */}
        {conversation.type === 'direct' && (() => {
          const participantUser = getOtherParticipantUser();
          if (participantUser) {
            const userFromStore = userStore.getUserById(participantUser.id);
            const effectiveUser = userFromStore || participantUser;
            const status = getUserStatus(effectiveUser);
            return (
              <OnlineIndicator
                isOnline={status === 'online'}
                status={status}
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
            <time
              className="text-xs text-muted-foreground flex-shrink-0"
              dateTime={new Date(conversation.lastMessage.createdAt).toISOString()}
            >
              {formatTime(conversation.lastMessage.createdAt)}
            </time>
          )}
        </div>

        {conversation.lastMessage && (
          <p className="text-sm text-muted-foreground truncate mt-0.5">
            {getSenderName(conversation.lastMessage) && (
              <span className="font-medium">{getSenderName(conversation.lastMessage)}: </span>
            )}
            {formatLastMessage(conversation.lastMessage)}
          </p>
        )}
      </div>

      {/* Badge de messages non lus */}
      {conversation.unreadCount !== undefined && conversation.unreadCount > 0 && (
        <Badge
          variant="destructive"
          aria-label={`${conversation.unreadCount} ${t('conversations.unreadMessages') || 'unread messages'}`}
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
