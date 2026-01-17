/**
 * Types pour le système de messages BubbleMessage
 * Re-exports des types partagés pour éviter les conflits
 */

import type { TranslationModel } from '@meeshy/shared/types';

// Re-export des types existants
export type { Message as BubbleMessage } from '@meeshy/shared/types';
export type { MessageTranslation } from '@meeshy/shared/types/conversation';
export type { BubbleTranslation as MessageVersion } from '@meeshy/shared/types';
export type { User as MessageSender } from '@meeshy/shared/types';
export type { AnonymousParticipant as AnonymousSender } from '@meeshy/shared/types';
export type { TranslationModel } from '@meeshy/shared/types';

// Types spécifiques au système de vues de messages
export type MessageViewType = 'normal' | 'reaction-selection' | 'language-selection' | 'edit' | 'delete';

export interface MessageViewState {
  activeView: MessageViewType;
  messageId: string | null;
  conversationId: string | null;
}

export interface EditMessageData {
  content: string;
  messageId: string;
}

export interface TranslationTier {
  id: TranslationModel;
  name: string;
  description: string;
  languages: string[];
  isPremium: boolean;
}

export interface LanguageOption {
  code: string;
  name: string;
  flag: string;
  tier: TranslationModel;
}

export interface EmojiCategory {
  id: string;
  name: string;
  emojis: string[];
  icon: string;
}

export interface MessageImpactPreview {
  translations: number;
  attachments: number;
  reactions: number;
  replies: number;
}