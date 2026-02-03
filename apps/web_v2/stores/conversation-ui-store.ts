/**
 * Conversation UI Store - Lightweight Zustand store for UI-only state
 *
 * This store is designed to work alongside React Query.
 * React Query handles all server state (conversations, messages, etc.)
 * This store handles only ephemeral UI state.
 *
 * Migration guide:
 * - Use useConversationsQuery() instead of conversations from conversation-store
 * - Use useInfiniteMessagesQuery() instead of messages from conversation-store
 * - Use this store for: currentConversationId, typingUsers, draftMessages, replyingTo
 */

import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';

interface DraftMessage {
  content: string;
  attachments?: string[];
  replyToId?: string;
}

interface ConversationUIState {
  // Current selected conversation
  currentConversationId: string | null;

  // Typing indicators (real-time ephemeral)
  typingUsers: Map<string, Set<string>>; // conversationId -> Set<userId>

  // Draft messages (local UI state)
  draftMessages: Map<string, DraftMessage>; // conversationId -> DraftMessage

  // Reply state (local UI)
  replyingTo: Map<string, string | null>; // conversationId -> messageId

  // UI preferences
  isCompactView: boolean;
  showTranslations: boolean;
}

interface ConversationUIActions {
  // Conversation selection
  setCurrentConversation: (conversationId: string | null) => void;

  // Typing indicators
  addTypingUser: (conversationId: string, userId: string) => void;
  removeTypingUser: (conversationId: string, userId: string) => void;
  clearTypingUsers: (conversationId: string) => void;
  getTypingUsers: (conversationId: string) => string[];

  // Draft messages
  setDraftMessage: (conversationId: string, draft: DraftMessage) => void;
  clearDraftMessage: (conversationId: string) => void;
  getDraftMessage: (conversationId: string) => DraftMessage | undefined;

  // Reply state
  setReplyingTo: (conversationId: string, messageId: string | null) => void;
  getReplyingTo: (conversationId: string) => string | null;
  clearReplyingTo: (conversationId: string) => void;

  // UI preferences
  setCompactView: (isCompact: boolean) => void;
  setShowTranslations: (show: boolean) => void;

  // Reset
  reset: () => void;
}

type ConversationUIStore = ConversationUIState & ConversationUIActions;

const initialState: ConversationUIState = {
  currentConversationId: null,
  typingUsers: new Map(),
  draftMessages: new Map(),
  replyingTo: new Map(),
  isCompactView: false,
  showTranslations: true,
};

export const useConversationUIStore = create<ConversationUIStore>()(
  devtools(
    persist(
      (set, get) => ({
        ...initialState,

        // Conversation selection
        setCurrentConversation: (conversationId) => {
          set({ currentConversationId: conversationId });
        },

        // Typing indicators
        addTypingUser: (conversationId, userId) => {
          set((state) => {
            const newTypingUsers = new Map(state.typingUsers);
            const users = newTypingUsers.get(conversationId) || new Set();
            users.add(userId);
            newTypingUsers.set(conversationId, users);
            return { typingUsers: newTypingUsers };
          });

          // Auto-remove after 5 seconds
          setTimeout(() => {
            get().removeTypingUser(conversationId, userId);
          }, 5000);
        },

        removeTypingUser: (conversationId, userId) => {
          set((state) => {
            const newTypingUsers = new Map(state.typingUsers);
            const users = newTypingUsers.get(conversationId);
            if (users) {
              users.delete(userId);
              if (users.size === 0) {
                newTypingUsers.delete(conversationId);
              }
            }
            return { typingUsers: newTypingUsers };
          });
        },

        clearTypingUsers: (conversationId) => {
          set((state) => {
            const newTypingUsers = new Map(state.typingUsers);
            newTypingUsers.delete(conversationId);
            return { typingUsers: newTypingUsers };
          });
        },

        getTypingUsers: (conversationId) => {
          const users = get().typingUsers.get(conversationId);
          return users ? Array.from(users) : [];
        },

        // Draft messages
        setDraftMessage: (conversationId, draft) => {
          set((state) => {
            const newDrafts = new Map(state.draftMessages);
            newDrafts.set(conversationId, draft);
            return { draftMessages: newDrafts };
          });
        },

        clearDraftMessage: (conversationId) => {
          set((state) => {
            const newDrafts = new Map(state.draftMessages);
            newDrafts.delete(conversationId);
            return { draftMessages: newDrafts };
          });
        },

        getDraftMessage: (conversationId) => {
          return get().draftMessages.get(conversationId);
        },

        // Reply state
        setReplyingTo: (conversationId, messageId) => {
          set((state) => {
            const newReplyingTo = new Map(state.replyingTo);
            if (messageId) {
              newReplyingTo.set(conversationId, messageId);
            } else {
              newReplyingTo.delete(conversationId);
            }
            return { replyingTo: newReplyingTo };
          });
        },

        getReplyingTo: (conversationId) => {
          return get().replyingTo.get(conversationId) || null;
        },

        clearReplyingTo: (conversationId) => {
          set((state) => {
            const newReplyingTo = new Map(state.replyingTo);
            newReplyingTo.delete(conversationId);
            return { replyingTo: newReplyingTo };
          });
        },

        // UI preferences
        setCompactView: (isCompact) => {
          set({ isCompactView: isCompact });
        },

        setShowTranslations: (show) => {
          set({ showTranslations: show });
        },

        // Reset
        reset: () => {
          set(initialState);
        },
      }),
      {
        name: 'conversation-ui-storage',
        partialize: (state) => ({
          // Only persist UI preferences, not ephemeral state
          isCompactView: state.isCompactView,
          showTranslations: state.showTranslations,
        }),
      }
    ),
    { name: 'ConversationUIStore' }
  )
);

// Selector hooks for common use cases
export const useCurrentConversationId = () =>
  useConversationUIStore((state) => state.currentConversationId);

export const useTypingUsersForConversation = (conversationId: string) =>
  useConversationUIStore((state) => {
    const users = state.typingUsers.get(conversationId);
    return users ? Array.from(users) : [];
  });

export const useDraftMessage = (conversationId: string) =>
  useConversationUIStore((state) => state.draftMessages.get(conversationId));

export const useReplyingTo = (conversationId: string) =>
  useConversationUIStore((state) => state.replyingTo.get(conversationId) || null);
