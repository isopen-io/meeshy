/**
 * Store pour gérer l'état de réponse aux messages
 * Utilise Zustand pour un state management simple et efficace
 */

import { create } from 'zustand';
import type { Message } from '@meeshy/shared/types/conversation';
import type { Attachment } from '@meeshy/shared/types/attachment';

export interface ReplyingToMessage {
  id: string;
  content: string;
  originalLanguage: string;
  sender?: {
    id: string;
    username?: string;
    displayName?: string;
    firstName?: string;
    lastName?: string;
    avatar?: string;
  };
  createdAt: Date;
  translations?: Array<{
    targetLanguage: string;
    translatedContent: string;
  }>;
  attachments?: Attachment[];
}

interface ReplyState {
  replyingTo: ReplyingToMessage | null;
  setReplyingTo: (message: ReplyingToMessage | null) => void;
  clearReply: () => void;
}

export const useReplyStore = create<ReplyState>((set) => ({
  replyingTo: null,
  setReplyingTo: (message) => set({ replyingTo: message }),
  clearReply: () => set({ replyingTo: null }),
}));

