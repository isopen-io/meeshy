'use client';

import { useState, useCallback, useEffect, memo } from 'react';
import { Pin, Globe, Users } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { Conversation, SocketIOUser as User } from '@meeshy/shared/types';
import { userPreferencesService } from '@/services/user-preferences.service';
import { getTagColor } from '@/utils/tag-colors';
import { toast } from 'sonner';
import { OnlineIndicator } from '@/components/ui/online-indicator';
import { getUserStatus } from '@/lib/user-status';
import { formatConversationDate, formatRelativeDate } from '@/utils/date-format';
import { useUserStore } from '@/stores/user-store';
import { ConversationItemActions } from './ConversationItemActions';
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
  // State local pour les préférences (sera mis à jour après les actions)
  const [localIsPinned, setLocalIsPinned] = useState(isPinned);
  const [localIsMuted, setLocalIsMuted] = useState(isMuted);
  const [localIsArchived, setLocalIsArchived] = useState(isArchived);
  const [localReaction, setLocalReaction] = useState(reaction);

  // Store global des utilisateurs (statuts en temps réel)
  const userStore = useUserStore();
  const _lastStatusUpdate = userStore._lastStatusUpdate; // Force re-render quand un statut change

  // Sync with props
  useEffect(() => {
    setLocalIsPinned(isPinned);
  }, [isPinned]);

  useEffect(() => {
    setLocalIsMuted(isMuted);
  }, [isMuted]);

  useEffect(() => {
    setLocalIsArchived(isArchived);
  }, [isArchived]);

  useEffect(() => {
    setLocalReaction(reaction);
  }, [reaction]);

  // Actions du menu
  const handleTogglePin = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await userPreferencesService.togglePin(conversation.id, !localIsPinned);
      setLocalIsPinned(!localIsPinned);
      toast.success(localIsPinned ? 'Conversation désépinglée' : 'Conversation épinglée');
    } catch (error) {
      console.error('Error toggling pin:', error);
      toast.error('Erreur lors de l\'épinglage');
    }
  }, [conversation.id, localIsPinned]);

  const handleToggleMute = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await userPreferencesService.toggleMute(conversation.id, !localIsMuted);
      setLocalIsMuted(!localIsMuted);
      toast.success(localIsMuted ? 'Notifications activées' : 'Notifications désactivées');
    } catch (error) {
      console.error('Error toggling mute:', error);
      toast.error('Erreur lors de la modification');
    }
  }, [conversation.id, localIsMuted]);

  const handleToggleArchive = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await userPreferencesService.toggleArchive(conversation.id, !localIsArchived);
      setLocalIsArchived(!localIsArchived);
      toast.success(localIsArchived ? 'Conversation désarchivée' : 'Conversation archivée');
    } catch (error) {
      console.error('Error toggling archive:', error);
      toast.error('Erreur lors de l\'archivage');
    }
  }, [conversation.id, localIsArchived]);

  const handleSetReaction = useCallback(async (e: React.MouseEvent, emoji: string) => {
    e.stopPropagation();
    try {
      const newReaction = localReaction === emoji ? null : emoji;
      await userPreferencesService.updateReaction(conversation.id, newReaction);
      setLocalReaction(newReaction || undefined);
      toast.success(newReaction ? `Réaction ${emoji} ajoutée` : 'Réaction supprimée');
    } catch (error) {
      console.error('Error setting reaction:', error);
      toast.error('Erreur lors de la modification');
    }
  }, [conversation.id, localReaction]);

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
    } catch (error: any) {
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
    const otherParticipant = conversation.participants?.find(p => p.userId !== currentUser?.id);
    return otherParticipant ? (otherParticipant as any).user : null;
  }, [conversation, currentUser]);

  const conversationName = getConversationNameOnly(conversation, getOtherParticipantUser);
  const conversationAvatar = getConversationAvatar(conversationName, getConversationCreatedDate(conversation, t));
  const avatarUrl = getConversationAvatarUrl(conversation, getOtherParticipantUser);
  const icon = getConversationIcon(conversation);

  const formatTime = useCallback((date: Date | string) => {
    return formatConversationDate(date, { t });
  }, [t]);

  const getSenderName = useCallback((message: any) => {
    const sender = message?.anonymousSender || message?.sender;
    const isAnonymous = !!message?.anonymousSender;

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

  return (
    <div
      onClick={onClick}
      className={cn(
        "group flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-all",
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
            {formatLastMessage(conversation.lastMessage)}
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
