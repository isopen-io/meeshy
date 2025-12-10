/**
 * Conversation Store - Chat and messaging state with Zustand
 */

import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { useShallow } from 'zustand/react/shallow';
import type { Conversation, Message, MessageTranslation } from '@meeshy/shared/types';

interface ConversationState {
  conversations: Conversation[];
  currentConversation: Conversation | null;
  messages: Map<string, Message[]>;
  isLoadingConversations: boolean;
  isLoadingMessages: Map<string, boolean>;
  hasMoreMessages: Map<string, boolean>;
  translatingMessages: Map<string, Set<string>>;
  typingUsers: Map<string, Set<string>>;
}

interface ConversationActions {
  // Conversations
  loadConversations: () => Promise<void>;
  loadConversation: (conversationId: string) => Promise<void>;
  selectConversation: (conversationId: string) => void;
  addConversation: (conversation: Conversation) => void;
  updateConversation: (conversationId: string, updates: Partial<Conversation>) => void;
  updateUnreadCount: (conversationId: string, unreadCount: number) => void;
  removeConversation: (conversationId: string) => void;
  
  // Messages
  loadMessages: (conversationId: string, options?: { offset?: number; limit?: number }) => Promise<void>;
  addMessage: (conversationId: string, message: Message) => void;
  updateMessage: (conversationId: string, messageId: string, updates: Partial<Message>) => void;
  deleteMessage: (conversationId: string, messageId: string) => void;
  clearMessages: (conversationId: string) => void;
  
  // Translations
  requestTranslation: (messageId: string, targetLanguage: string, sourceLanguage?: string) => Promise<void>;
  addTranslation: (messageId: string, translation: MessageTranslation) => void;
  
  // Real-time features
  sendMessage: (content: string) => Promise<void>;
  setTyping: (conversationId: string, isTyping: boolean) => void;
  addTypingUser: (conversationId: string, userId: string) => void;
  removeTypingUser: (conversationId: string, userId: string) => void;
}

type ConversationStore = ConversationState & ConversationActions;

// Mock API functions (these would be replaced with actual service calls)
async function fetchConversations(): Promise<Conversation[]> {
  return [];
}

async function fetchConversation(conversationId: string): Promise<Conversation> {
  throw new Error('Not implemented');
}

async function fetchMessages(conversationId: string, offset: number, limit: number): Promise<{ messages: Message[]; hasMore: boolean }> {
  return { messages: [], hasMore: false };
}

async function requestMessageTranslation(messageId: string, targetLanguage: string, sourceLanguage: string): Promise<void> {
  // Simulate API call
}

async function sendMessageToConversation(conversationId: string, content: string): Promise<void> {
  // Simulate API call
}

const initialState: ConversationState = {
  conversations: [],
  currentConversation: null,
  messages: new Map(),
  isLoadingConversations: false,
  isLoadingMessages: new Map(),
  hasMoreMessages: new Map(),
  translatingMessages: new Map(),
  typingUsers: new Map(),
};

export const useConversationStore = create<ConversationStore>()(
  devtools(
    (set, get) => ({
      ...initialState,

      // Conversation Actions
      loadConversations: async () => {
        if (get().isLoadingConversations) return;
        
        set({ isLoadingConversations: true });
        
        try {
          const conversations = await fetchConversations();
          set({ conversations, isLoadingConversations: false });
        } catch (error) {
          console.error('[CONVERSATION_STORE] Load conversations failed:', error);
          set({ isLoadingConversations: false });
        }
      },

      loadConversation: async (conversationId: string) => {
        try {
          const conversation = await fetchConversation(conversationId);
          
          set((state) => {
            const exists = state.conversations.some(c => c.id === conversationId);
            const updatedConversations = exists
              ? state.conversations.map(c => c.id === conversationId ? conversation : c)
              : [...state.conversations, conversation];
            
            return {
              conversations: updatedConversations,
              currentConversation: conversation,
            };
          });
        } catch (error) {
          console.error('[CONVERSATION_STORE] Load conversation failed:', error);
        }
      },

      selectConversation: (conversationId: string) => {
        const conversation = get().conversations.find(c => c.id === conversationId);
        if (conversation) {
          set({ currentConversation: conversation });
        }
      },

      addConversation: (conversation: Conversation) => {
        set((state) => {
          // Avoid duplicates
          if (state.conversations.some(c => c.id === conversation.id)) {
            return state;
          }
          return {
            conversations: [conversation, ...state.conversations],
          };
        });
      },

      updateConversation: (conversationId: string, updates: Partial<Conversation>) => {
        set((state) => ({
          conversations: state.conversations.map(c =>
            c.id === conversationId ? { ...c, ...updates } : c
          ),
          currentConversation: state.currentConversation?.id === conversationId
            ? { ...state.currentConversation, ...updates }
            : state.currentConversation,
        }));
      },

      updateUnreadCount: (conversationId: string, unreadCount: number) => {
        set((state) => ({
          conversations: state.conversations.map(c =>
            c.id === conversationId ? { ...c, unreadCount } : c
          ),
          currentConversation: state.currentConversation?.id === conversationId
            ? { ...state.currentConversation, unreadCount }
            : state.currentConversation,
        }));
      },

      removeConversation: (conversationId: string) => {
        set((state) => ({
          conversations: state.conversations.filter(c => c.id !== conversationId),
          currentConversation: state.currentConversation?.id === conversationId
            ? null
            : state.currentConversation,
          messages: (() => {
            const newMessages = new Map(state.messages);
            newMessages.delete(conversationId);
            return newMessages;
          })(),
          isLoadingMessages: (() => {
            const newLoadingMessages = new Map(state.isLoadingMessages);
            newLoadingMessages.delete(conversationId);
            return newLoadingMessages;
          })(),
          hasMoreMessages: (() => {
            const newHasMore = new Map(state.hasMoreMessages);
            newHasMore.delete(conversationId);
            return newHasMore;
          })(),
        }));
      },

      // Message Actions
      loadMessages: async (conversationId: string, options = {}) => {
        const { offset = 0, limit = 20 } = options;
        
        // Check if already loading
        if (get().isLoadingMessages.get(conversationId)) return;
        
        set((state) => ({
          isLoadingMessages: new Map(state.isLoadingMessages).set(conversationId, true),
        }));
        
        try {
          const response = await fetchMessages(conversationId, offset, limit);
          
          set((state) => {
            const newMessages = new Map(state.messages);
            const existingMessages = newMessages.get(conversationId) || [];
            
            if (offset === 0) {
              // Initial load - replace
              newMessages.set(conversationId, response.messages);
            } else {
              // Pagination - append older messages
              const messageIds = new Set(existingMessages.map(m => m.id));
              const newUniqueMessages = response.messages.filter(m => !messageIds.has(m.id));
              newMessages.set(conversationId, [...existingMessages, ...newUniqueMessages]);
            }
            
            const newIsLoadingMessages = new Map(state.isLoadingMessages);
            newIsLoadingMessages.set(conversationId, false);
            
            const newHasMoreMessages = new Map(state.hasMoreMessages);
            newHasMoreMessages.set(conversationId, response.hasMore);
            
            return {
              messages: newMessages,
              isLoadingMessages: newIsLoadingMessages,
              hasMoreMessages: newHasMoreMessages,
            };
          });
        } catch (error) {
          console.error('[CONVERSATION_STORE] Load messages failed:', error);
          set((state) => ({
            isLoadingMessages: new Map(state.isLoadingMessages).set(conversationId, false),
          }));
        }
      },

      addMessage: (conversationId: string, message: Message) => {
        set((state) => {
          const newMessages = new Map(state.messages);
          const existingMessages = newMessages.get(conversationId) || [];
          
          // Check for duplicates
          if (existingMessages.some(m => m.id === message.id)) {
            return state;
          }
          
          // Add to beginning (newest first)
          newMessages.set(conversationId, [message, ...existingMessages]);
          
          // Update conversation's last message
          const updatedConversations = state.conversations.map(c =>
            c.id === conversationId ? { ...c, lastMessage: message } : c
          );
          
          return {
            messages: newMessages,
            conversations: updatedConversations,
          };
        });
      },

      updateMessage: (conversationId: string, messageId: string, updates: Partial<Message>) => {
        set((state) => {
          const newMessages = new Map(state.messages);
          const messages = newMessages.get(conversationId);
          
          if (messages) {
            newMessages.set(
              conversationId,
              messages.map(m => m.id === messageId ? { ...m, ...updates } : m)
            );
          }
          
          return { messages: newMessages };
        });
      },

      deleteMessage: (conversationId: string, messageId: string) => {
        set((state) => {
          const newMessages = new Map(state.messages);
          const messages = newMessages.get(conversationId);
          
          if (messages) {
            newMessages.set(
              conversationId,
              messages.filter(m => m.id !== messageId)
            );
          }
          
          return { messages: newMessages };
        });
      },

      clearMessages: (conversationId: string) => {
        set((state) => {
          const newMessages = new Map(state.messages);
          newMessages.delete(conversationId);
          
          return { messages: newMessages };
        });
      },

      // Translation Actions
      requestTranslation: async (messageId: string, targetLanguage: string, sourceLanguage = 'auto') => {
        // Mark as translating
        set((state) => {
          const newTranslatingMessages = new Map(state.translatingMessages);
          const langs = newTranslatingMessages.get(messageId) || new Set();
          langs.add(targetLanguage);
          newTranslatingMessages.set(messageId, langs);
          
          return { translatingMessages: newTranslatingMessages };
        });
        
        try {
          await requestMessageTranslation(messageId, targetLanguage, sourceLanguage);
        } catch (error) {
          console.error('[CONVERSATION_STORE] Translation request failed:', error);
          
          // Remove from translating
          set((state) => {
            const newTranslatingMessages = new Map(state.translatingMessages);
            const langs = newTranslatingMessages.get(messageId);
            if (langs) {
              langs.delete(targetLanguage);
              if (langs.size === 0) {
                newTranslatingMessages.delete(messageId);
              }
            }
            
            return { translatingMessages: newTranslatingMessages };
          });
        }
      },

      addTranslation: (messageId: string, translation: MessageTranslation) => {
        // Find the conversation containing this message
        const { messages } = get();
        
        for (const [conversationId, msgs] of messages.entries()) {
          const messageIndex = msgs.findIndex(m => m.id === messageId);
          if (messageIndex !== -1) {
            const message = msgs[messageIndex];
            
            // Update message with new translation
            const updatedTranslations = [...(message.translations || [])];
            const existingIndex = updatedTranslations.findIndex(
              t => t.targetLanguage === translation.targetLanguage
            );
            
            if (existingIndex >= 0) {
              updatedTranslations[existingIndex] = translation;
            } else {
              updatedTranslations.push(translation);
            }
            
            get().updateMessage(conversationId, messageId, { translations: updatedTranslations });
            
            // Remove from translating state
            set((state) => {
              const newTranslatingMessages = new Map(state.translatingMessages);
              const langs = newTranslatingMessages.get(messageId);
              if (langs) {
                langs.delete(translation.targetLanguage);
                if (langs.size === 0) {
                  newTranslatingMessages.delete(messageId);
                }
              }
              
              return { translatingMessages: newTranslatingMessages };
            });
            
            break;
          }
        }
      },

      // Real-time Actions
      sendMessage: async (content: string) => {
        const { currentConversation } = get();
        if (!currentConversation?.id) return;
        
        try {
          await sendMessageToConversation(currentConversation.id, content);
        } catch (error) {
          console.error('[CONVERSATION_STORE] Send message failed:', error);
        }
      },

      setTyping: (conversationId: string, isTyping: boolean) => {
      },

      addTypingUser: (conversationId: string, userId: string) => {
        set((state) => {
          const newTypingUsers = new Map(state.typingUsers);
          const users = newTypingUsers.get(conversationId) || new Set();
          users.add(userId);
          newTypingUsers.set(conversationId, users);
          
          return { typingUsers: newTypingUsers };
        });
      },

      removeTypingUser: (conversationId: string, userId: string) => {
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
    }),
    { name: 'ConversationStore' }
  )
);

// Selector hooks
export const useConversations = () => useConversationStore((state) => state.conversations);
export const useCurrentConversation = () => useConversationStore((state) => state.currentConversation);
export const useConversationMessages = (conversationId: string) => 
  useConversationStore((state) => state.messages.get(conversationId) || []);
export const useConversationLoading = (conversationId: string) => 
  useConversationStore((state) => state.isLoadingMessages.get(conversationId) || false);
export const useTypingUsers = (conversationId: string) => 
  useConversationStore((state) => state.typingUsers.get(conversationId) || new Set());

// Use useShallow to prevent infinite loops when selecting multiple actions
export const useConversationActions = () => useConversationStore(
  useShallow((state) => ({
    loadConversations: state.loadConversations,
    selectConversation: state.selectConversation,
    addMessage: state.addMessage,
    sendMessage: state.sendMessage,
    requestTranslation: state.requestTranslation,
  }))
);