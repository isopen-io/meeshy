'use client';

import { useCallback } from 'react';
import { toast } from 'sonner';
import type { Conversation } from '@meeshy/shared/types';
import { copyToClipboard } from '@/lib/clipboard';
import {
  useConversationPreference,
  useConversationPreferencesActions,
} from '@/stores/conversation-preferences-store';

/**
 * Les SIX actions de rang (réglages, épingle, sourdine, archive, partage,
 * réaction) — EXTRACTION des handlers de `ConversationItem`, jamais un second
 * jeu (REV-4/B3).
 *
 * Le verdict de la porte V2 : « drapeau ON ⇒ les 6 actions historiques du ⋮
 * de rang inatteignables » (behaviour-matrix L07). Elles n'étaient pas
 * absentes du produit — elles étaient PRISONNIÈRES de `ConversationItem`,
 * que le drapeau ne rend plus. Les recopier dans la peau Lentille aurait
 * créé deux vérités destinées à diverger ; ce hook les rend disponibles là
 * où il en faut, avec le MÊME magasin, les MÊMES bascules et les MÊMES
 * toasts.
 *
 * L'ÉTAT vient d'abord du magasin (`useConversationPreference`, abonné à
 * CETTE conversation seule) ; les valeurs passées en repli servent quand le
 * magasin n'a pas encore la ligne — exactement la précédence qu'appliquait
 * `ConversationItem` avant l'extraction.
 */
export interface UseConversationItemActionsOptions {
  readonly conversation: Conversation;
  readonly t: (key: string) => string;
  readonly onShowDetails?: (conversation: Conversation) => void;
  /** Replis, utilisés seulement si le magasin n'a pas encore cette conversation. */
  readonly isPinned?: boolean;
  readonly isMuted?: boolean;
  readonly isArchived?: boolean;
  readonly reaction?: string;
}

export interface ConversationItemActionsState {
  readonly isPinned: boolean;
  readonly isMuted: boolean;
  readonly isArchived: boolean;
  readonly reaction?: string;
  readonly onTogglePin: (e: React.MouseEvent) => void;
  readonly onToggleMute: (e: React.MouseEvent) => void;
  readonly onToggleArchive: (e: React.MouseEvent) => void;
  readonly onSetReaction: (e: React.MouseEvent, emoji: string) => void;
  readonly onShowDetails: (e: React.MouseEvent) => void;
  readonly onShareConversation: (e: React.MouseEvent) => void;
}

export function useConversationItemActions({
  conversation,
  t,
  onShowDetails,
  isPinned = false,
  isMuted = false,
  isArchived = false,
  reaction,
}: UseConversationItemActionsOptions): ConversationItemActionsState {
  const storePrefs = useConversationPreference(conversation.id);
  const { togglePin, toggleMute, toggleArchive, setReaction } = useConversationPreferencesActions();

  const localIsPinned = storePrefs?.isPinned ?? isPinned;
  const localIsMuted = storePrefs?.isMuted ?? isMuted;
  const localIsArchived = storePrefs?.isArchived ?? isArchived;
  const localReaction = storePrefs?.reaction ?? reaction;

  const handleTogglePin = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await togglePin(conversation.id, !localIsPinned);
      toast.success(localIsPinned ? t('conversationHeader.unpinned') : t('conversationHeader.pinned'));
    } catch (error) {
      console.error('Error toggling pin:', error);
      toast.error(t('conversationHeader.pinError'));
    }
  }, [conversation.id, localIsPinned, togglePin]);

  const handleToggleMute = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await toggleMute(conversation.id, !localIsMuted);
      toast.success(localIsMuted ? t('conversationHeader.unmuted') : t('conversationHeader.muted'));
    } catch (error) {
      console.error('Error toggling mute:', error);
      toast.error(t('conversationHeader.muteError'));
    }
  }, [conversation.id, localIsMuted, toggleMute]);

  const handleToggleArchive = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await toggleArchive(conversation.id, !localIsArchived);
      toast.success(localIsArchived ? t('conversationHeader.unarchived') : t('conversationHeader.archived'));
    } catch (error) {
      console.error('Error toggling archive:', error);
      toast.error(t('conversationHeader.archiveError'));
    }
  }, [conversation.id, localIsArchived, toggleArchive]);

  const handleSetReaction = useCallback(async (e: React.MouseEvent, emoji: string) => {
    e.stopPropagation();
    try {
      const newReaction = localReaction === emoji ? null : emoji;
      await setReaction(conversation.id, newReaction);
      toast.success(newReaction ? t('conversationDetails.reactionAdded').replace('{emoji}', emoji) : t('conversationDetails.reactionRemoved'));
    } catch (error) {
      console.error('Error setting reaction:', error);
      toast.error(t('conversationDetails.reactionError'));
    }
  }, [conversation.id, localReaction, setReaction]);

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
        const { success } = await copyToClipboard(fullMessage);
        if (success) {
          toast.success(t('conversationHeader.linkCopied'));
        } else {
          toast.error(t('conversationHeader.linkCopyError'));
        }
      }
    } catch (error: unknown) {
      if ((error as { name?: string })?.name === 'AbortError') {
        return;
      }
      console.error('Error sharing:', error);
      toast.error(t('conversationHeader.linkCopyError'));
    }
  }, [conversation.id, t]);

  return {
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
  };
}
