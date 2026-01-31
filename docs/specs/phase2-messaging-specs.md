# Phase 2 - Messaging V2 Specifications

## Overview

Cette phase connecte la page `/v2/chats` aux services réels en remplaçant les données mockées par des appels API et une communication temps réel via Socket.IO.

**Prérequis**: Phase 1 (Auth V2) terminée.

---

## 1. Architecture Existante

### 1.1 Services Backend

#### ConversationsService (`services/conversations/`)
```typescript
// Endpoint principal: /conversations
interface GetConversationsOptions {
  limit?: number;
  offset?: number;
  skipCache?: boolean;
  type?: ConversationType;
  withUserId?: string;
}

interface GetConversationsResponse {
  conversations: Conversation[];
  pagination: {
    limit: number;
    offset: number;
    total: number;
    hasMore: boolean;
  };
}
```

**Méthodes clés**:
- `getConversations(options)` - Liste avec pagination
- `getConversation(id)` - Détail d'une conversation
- `getMessages(conversationId, page, limit)` - Messages paginés
- `sendMessage(conversationId, data)` - Envoi de message
- `markAsRead(conversationId)` - Marquer comme lu

#### MessagesService (`services/messages.service.ts`)
```typescript
// Endpoint: /conversations/{id}/messages
interface MessagesResponse {
  success: boolean;
  data: Message[];
  pagination: PaginationMeta;
  meta: { userLanguage: string };
}
```

### 1.2 WebSocket Service (`services/websocket.service.ts`)

**Singleton Pattern** - Connexion globale partagée.

```typescript
// Événements serveur -> client
SERVER_EVENTS = {
  AUTHENTICATED: 'authenticated',
  MESSAGE_NEW: 'message:new',
  MESSAGE_EDITED: 'message:edited',
  MESSAGE_DELETED: 'message:deleted',
  MESSAGE_TRANSLATION: 'message:translation',
  TYPING_START: 'typing:start',
  TYPING_STOP: 'typing:stop',
  USER_STATUS: 'user:status',
  ERROR: 'error'
}

// Événements client -> serveur
CLIENT_EVENTS = {
  CONVERSATION_JOIN: 'conversation:join',
  CONVERSATION_LEAVE: 'conversation:leave',
  MESSAGE_SEND: 'message:send',
  MESSAGE_SEND_WITH_ATTACHMENTS: 'message:send:attachments',
  MESSAGE_EDIT: 'message:edit',
  MESSAGE_DELETE: 'message:delete',
  TYPING_START: 'typing:start',
  TYPING_STOP: 'typing:stop'
}
```

### 1.3 Hooks React Query Existants

```typescript
// hooks/queries/use-conversations-query.ts
useConversationsQuery(options)           // Liste simple
useConversationsWithPagination(options)  // Avec pagination
useConversationQuery(conversationId)     // Détail
useInfiniteConversationsQuery(options)   // Scroll infini

// hooks/queries/use-messages-query.ts
useMessagesQuery(conversationId, options)
useInfiniteMessagesQuery(conversationId, options)
useMessagesQueryHelpers(conversationId)  // Cache helpers

// hooks/use-websocket.ts
useWebSocket(options)  // WebSocket avec listeners
```

### 1.4 Store Zustand (`stores/conversation-store.ts`)

État global pour les conversations et messages avec gestion du temps réel.

---

## 2. Page V2 Chats - Analyse des Données Mockées

### 2.1 Données à Remplacer

```typescript
// /app/v2/chats/page.tsx - Lignes à remplacer

// MOCK: mockConversations (ligne ~870)
const mockConversations: ConversationItemData[] = [...];

// MOCK: mockCategories (ligne ~848)
const mockCategories: TagItem[] = [...];

// MOCK: mockTags (ligne ~854)
const mockTags: TagItem[] = [...];

// MOCK: mockCommunities (ligne ~860)
const mockCommunities: CommunityItem[] = [...];

// MOCK: Messages hardcodés dans le JSX (lignes ~1450+)
<MessageBubble ... /> // Plusieurs messages statiques
```

### 2.2 Composants Utilisés (V2)

```typescript
// Depuis @/components/v2
- ConversationItem      // Item de liste conversation
- MessageBubble         // Message texte avec traductions
- MessageComposer       // Zone de saisie
- MessageTimestamp      // Horodatage
- ImageGallery          // Galerie d'images
- AudioPlayer           // Lecteur audio
- VideoPlayer           // Lecteur vidéo
- ReplyPreview          // Aperçu de réponse
- LanguageOrb           // Indicateur de langue
- ConversationDrawer    // Panneau latéral
- CommunityCarousel     // Carrousel communautés
- CategoryHeader        // En-tête de catégorie
```

---

## 3. Nouveaux Hooks à Créer

### 3.1 `useConversationsV2`

**Fichier**: `hooks/v2/use-conversations-v2.ts`

```typescript
/**
 * Hook pour la gestion des conversations V2
 * Combine React Query + WebSocket pour temps réel
 */

import { useCallback, useMemo, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  useInfiniteConversationsQuery,
  useConversationQuery,
} from '@/hooks/queries/use-conversations-query';
import { useWebSocket } from '@/hooks/use-websocket';
import { queryKeys } from '@/lib/react-query/query-keys';
import type { Conversation, Message } from '@meeshy/shared/types';

export interface UseConversationsV2Options {
  enabled?: boolean;
  limit?: number;
}

export interface ConversationsV2Return {
  // Data
  conversations: Conversation[];
  currentConversation: Conversation | null;

  // Loading states
  isLoading: boolean;
  isLoadingMore: boolean;

  // Pagination
  hasMore: boolean;
  loadMore: () => Promise<void>;

  // Actions
  selectConversation: (id: string) => void;
  refreshConversations: () => Promise<void>;

  // Grouped data
  pinnedConversations: Conversation[];
  categorizedConversations: Map<string, Conversation[]>;
  uncategorizedConversations: Conversation[];

  // Real-time
  isConnected: boolean;

  // Error
  error: string | null;
}

export function useConversationsV2(
  selectedId: string | null,
  options: UseConversationsV2Options = {}
): ConversationsV2Return {
  const { enabled = true, limit = 20 } = options;
  const queryClient = useQueryClient();

  // Query pour la liste des conversations
  const {
    data,
    isLoading,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
    error,
    refetch,
  } = useInfiniteConversationsQuery({
    limit,
    enabled,
  });

  // Query pour la conversation sélectionnée
  const {
    data: currentConversation,
    isLoading: isLoadingCurrent,
  } = useConversationQuery(selectedId);

  // WebSocket pour les mises à jour temps réel
  const { isConnected } = useWebSocket({
    conversationId: selectedId,
    onNewMessage: useCallback((message: Message) => {
      // Mettre à jour lastMessage dans la liste
      queryClient.setQueryData(
        queryKeys.conversations.infinite(),
        (old: any) => {
          if (!old) return old;
          return {
            ...old,
            pages: old.pages.map((page: any) => ({
              ...page,
              conversations: page.conversations.map((conv: Conversation) =>
                conv.id === message.conversationId
                  ? { ...conv, lastMessage: message, lastMessageAt: message.createdAt }
                  : conv
              ),
            })),
          };
        }
      );
    }, [queryClient]),
  });

  // Extraire les conversations de toutes les pages
  const conversations = useMemo(() => {
    if (!data?.pages) return [];
    return data.pages.flatMap((page) => page.conversations);
  }, [data?.pages]);

  // Grouper les conversations
  const { pinnedConversations, categorizedConversations, uncategorizedConversations } = useMemo(() => {
    const pinned = conversations.filter((c) => c.isPinned);
    const categorized = new Map<string, Conversation[]>();
    const uncategorized: Conversation[] = [];

    conversations.forEach((conv) => {
      if (conv.isPinned) return; // Déjà dans pinned

      if (conv.categoryId) {
        const existing = categorized.get(conv.categoryId) || [];
        categorized.set(conv.categoryId, [...existing, conv]);
      } else {
        uncategorized.push(conv);
      }
    });

    return { pinnedConversations: pinned, categorizedConversations: categorized, uncategorizedConversations: uncategorized };
  }, [conversations]);

  // Actions
  const loadMore = useCallback(async () => {
    if (hasNextPage && !isFetchingNextPage) {
      await fetchNextPage();
    }
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const refreshConversations = useCallback(async () => {
    await refetch();
  }, [refetch]);

  const selectConversation = useCallback((id: string) => {
    // La sélection est gérée par le parent via selectedId
    // Ce hook peut prefetch les données si nécessaire
    queryClient.prefetchQuery({
      queryKey: queryKeys.conversations.detail(id),
    });
  }, [queryClient]);

  return {
    conversations,
    currentConversation: currentConversation ?? null,
    isLoading: isLoading || isLoadingCurrent,
    isLoadingMore: isFetchingNextPage,
    hasMore: hasNextPage ?? false,
    loadMore,
    selectConversation,
    refreshConversations,
    pinnedConversations,
    categorizedConversations,
    uncategorizedConversations,
    isConnected,
    error: error?.message ?? null,
  };
}
```

### 3.2 `useMessagesV2`

**Fichier**: `hooks/v2/use-messages-v2.ts`

```typescript
/**
 * Hook pour la gestion des messages V2
 * Intègre React Query + WebSocket + optimistic updates
 */

import { useCallback, useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useConversationMessagesRQ } from '@/hooks/queries/use-conversation-messages-rq';
import { useWebSocket } from '@/hooks/use-websocket';
import { conversationsService } from '@/services/conversations.service';
import { queryKeys } from '@/lib/react-query/query-keys';
import type { Message, User, TypingEvent } from '@meeshy/shared/types';

export interface UseMessagesV2Options {
  enabled?: boolean;
  limit?: number;
  containerRef?: React.RefObject<HTMLDivElement | null>;
  onNewMessage?: (message: Message) => void;
}

export interface MessagesV2Return {
  // Data
  messages: Message[];

  // Loading states
  isLoading: boolean;
  isLoadingMore: boolean;
  isSending: boolean;

  // Pagination
  hasMore: boolean;
  loadMore: () => Promise<void>;

  // Actions
  sendMessage: (content: string, options?: SendMessageOptions) => Promise<boolean>;
  editMessage: (messageId: string, content: string) => Promise<boolean>;
  deleteMessage: (messageId: string) => Promise<boolean>;

  // Typing
  typingUsers: Set<string>;
  startTyping: () => void;
  stopTyping: () => void;

  // Utils
  refresh: () => Promise<void>;
  markAsRead: () => Promise<void>;

  // Real-time status
  isConnected: boolean;

  // Error
  error: string | null;
}

export interface SendMessageOptions {
  replyToId?: string;
  attachmentIds?: string[];
  language?: string;
}

export function useMessagesV2(
  conversationId: string | null,
  currentUser: User | null,
  options: UseMessagesV2Options = {}
): MessagesV2Return {
  const {
    enabled = true,
    limit = 20,
    containerRef,
    onNewMessage,
  } = options;

  const queryClient = useQueryClient();
  const isSendingRef = useRef(false);
  const typingUsersRef = useRef(new Set<string>());

  // Hook existant pour les messages avec React Query
  const {
    messages,
    isLoading,
    isLoadingMore,
    hasMore,
    error,
    loadMore,
    refresh,
    addMessage,
    updateMessage,
    removeMessage,
  } = useConversationMessagesRQ(conversationId, currentUser, {
    enabled: enabled && !!conversationId,
    limit,
    containerRef,
    scrollDirection: 'up',
  });

  // WebSocket pour le temps réel
  const {
    isConnected,
    sendMessage: wsSendMessage,
    sendMessageWithAttachments,
    editMessage: wsEditMessage,
    deleteMessage: wsDeleteMessage,
    startTyping: wsStartTyping,
    stopTyping: wsStopTyping,
  } = useWebSocket({
    conversationId,
    onNewMessage: useCallback((message: Message) => {
      // Ajouter au cache seulement si pas de nous
      if (message.senderId !== currentUser?.id) {
        addMessage(message);
      }
      onNewMessage?.(message);
    }, [addMessage, currentUser?.id, onNewMessage]),

    onMessageEdited: useCallback((message: Message) => {
      updateMessage(message.id, message);
    }, [updateMessage]),

    onMessageDeleted: useCallback((messageId: string) => {
      removeMessage(messageId);
    }, [removeMessage]),

    onTyping: useCallback((event: TypingEvent) => {
      if (event.userId === currentUser?.id) return;

      if (event.isTyping) {
        typingUsersRef.current.add(event.userId);
      } else {
        typingUsersRef.current.delete(event.userId);
      }
    }, [currentUser?.id]),
  });

  // Send message avec optimistic update
  const sendMessage = useCallback(async (
    content: string,
    options: SendMessageOptions = {}
  ): Promise<boolean> => {
    if (!conversationId || !currentUser || isSendingRef.current) return false;

    const { replyToId, attachmentIds, language = 'fr' } = options;

    isSendingRef.current = true;

    // Optimistic update - créer un message temporaire
    const tempId = `temp-${Date.now()}`;
    const optimisticMessage: Message = {
      id: tempId,
      conversationId,
      senderId: currentUser.id,
      content,
      originalLanguage: language,
      messageType: 'text',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      isEdited: false,
      isDeleted: false,
      translations: [],
      replyToId,
      sender: currentUser,
    } as Message;

    // Ajouter immédiatement au cache
    addMessage(optimisticMessage);

    try {
      let success: boolean;

      if (attachmentIds && attachmentIds.length > 0) {
        success = await sendMessageWithAttachments(content, attachmentIds, language, replyToId);
      } else {
        success = await wsSendMessage(content, language, replyToId);
      }

      if (!success) {
        // Rollback - retirer le message optimiste
        removeMessage(tempId);
      }
      // Note: Le vrai message arrivera via WebSocket et sera ajouté

      return success;
    } catch (error) {
      // Rollback
      removeMessage(tempId);
      return false;
    } finally {
      isSendingRef.current = false;
    }
  }, [conversationId, currentUser, addMessage, removeMessage, wsSendMessage, sendMessageWithAttachments]);

  // Edit message
  const editMessage = useCallback(async (messageId: string, content: string): Promise<boolean> => {
    // Optimistic update
    const originalMessage = messages.find(m => m.id === messageId);
    if (originalMessage) {
      updateMessage(messageId, { content, isEdited: true });
    }

    const success = await wsEditMessage(messageId, content);

    if (!success && originalMessage) {
      // Rollback
      updateMessage(messageId, originalMessage);
    }

    return success;
  }, [messages, updateMessage, wsEditMessage]);

  // Delete message
  const deleteMessage = useCallback(async (messageId: string): Promise<boolean> => {
    // Garder une copie pour rollback
    const deletedMessage = messages.find(m => m.id === messageId);

    // Optimistic update
    removeMessage(messageId);

    const success = await wsDeleteMessage(messageId);

    if (!success && deletedMessage) {
      // Rollback
      addMessage(deletedMessage);
    }

    return success;
  }, [messages, removeMessage, addMessage, wsDeleteMessage]);

  // Mark as read
  const markAsRead = useCallback(async () => {
    if (!conversationId) return;

    try {
      await conversationsService.markAsRead(conversationId);

      // Mettre à jour le unreadCount dans la liste des conversations
      queryClient.setQueryData(
        queryKeys.conversations.infinite(),
        (old: any) => {
          if (!old) return old;
          return {
            ...old,
            pages: old.pages.map((page: any) => ({
              ...page,
              conversations: page.conversations.map((conv: any) =>
                conv.id === conversationId ? { ...conv, unreadCount: 0 } : conv
              ),
            })),
          };
        }
      );
    } catch (error) {
      console.error('Failed to mark as read:', error);
    }
  }, [conversationId, queryClient]);

  // Mark as read when viewing messages
  useEffect(() => {
    if (conversationId && messages.length > 0 && !isLoading) {
      markAsRead();
    }
  }, [conversationId, messages.length, isLoading, markAsRead]);

  return {
    messages,
    isLoading,
    isLoadingMore,
    isSending: isSendingRef.current,
    hasMore,
    loadMore,
    sendMessage,
    editMessage,
    deleteMessage,
    typingUsers: typingUsersRef.current,
    startTyping: wsStartTyping,
    stopTyping: wsStopTyping,
    refresh,
    markAsRead,
    isConnected,
    error,
  };
}
```

### 3.3 `useUserPreferencesV2`

**Fichier**: `hooks/v2/use-user-preferences-v2.ts`

```typescript
/**
 * Hook pour les préférences utilisateur V2 (catégories, tags, etc.)
 */

import { useCallback, useState, useEffect } from 'react';
import { useQueryClient, useMutation, useQuery } from '@tanstack/react-query';
import { apiService } from '@/services/api.service';
import type { TagItem } from '@/components/v2';

export interface Category extends TagItem {
  order?: number;
}

export interface UseUserPreferencesV2Return {
  // Categories
  categories: Category[];
  createCategory: (name: string, color?: string) => Promise<Category>;
  updateCategory: (id: string, updates: Partial<Category>) => Promise<void>;
  deleteCategory: (id: string) => Promise<void>;
  reorderCategories: (ids: string[]) => Promise<void>;

  // Tags
  tags: TagItem[];
  createTag: (name: string, color?: string) => Promise<TagItem>;
  deleteTag: (id: string) => Promise<void>;

  // Conversation assignments
  assignCategory: (conversationId: string, categoryId: string | null) => Promise<void>;
  assignTags: (conversationId: string, tagIds: string[]) => Promise<void>;

  // Loading
  isLoading: boolean;
}

const QUERY_KEYS = {
  categories: ['user', 'categories'],
  tags: ['user', 'tags'],
};

export function useUserPreferencesV2(): UseUserPreferencesV2Return {
  const queryClient = useQueryClient();

  // Query pour les catégories
  const { data: categories = [], isLoading: isLoadingCategories } = useQuery({
    queryKey: QUERY_KEYS.categories,
    queryFn: async () => {
      const response = await apiService.get<{ data: Category[] }>('/user/categories');
      return response.data?.data ?? [];
    },
  });

  // Query pour les tags
  const { data: tags = [], isLoading: isLoadingTags } = useQuery({
    queryKey: QUERY_KEYS.tags,
    queryFn: async () => {
      const response = await apiService.get<{ data: TagItem[] }>('/user/tags');
      return response.data?.data ?? [];
    },
  });

  // Mutations
  const createCategoryMutation = useMutation({
    mutationFn: async ({ name, color }: { name: string; color?: string }) => {
      const response = await apiService.post<{ data: Category }>('/user/categories', { name, color });
      return response.data?.data!;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.categories });
    },
  });

  const updateCategoryMutation = useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Partial<Category> }) => {
      await apiService.patch(`/user/categories/${id}`, updates);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.categories });
    },
  });

  const deleteCategoryMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiService.delete(`/user/categories/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.categories });
    },
  });

  const createTagMutation = useMutation({
    mutationFn: async ({ name, color }: { name: string; color?: string }) => {
      const response = await apiService.post<{ data: TagItem }>('/user/tags', { name, color });
      return response.data?.data!;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.tags });
    },
  });

  const deleteTagMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiService.delete(`/user/tags/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.tags });
    },
  });

  // Actions
  const createCategory = useCallback(async (name: string, color?: string) => {
    return createCategoryMutation.mutateAsync({ name, color });
  }, [createCategoryMutation]);

  const updateCategory = useCallback(async (id: string, updates: Partial<Category>) => {
    await updateCategoryMutation.mutateAsync({ id, updates });
  }, [updateCategoryMutation]);

  const deleteCategory = useCallback(async (id: string) => {
    await deleteCategoryMutation.mutateAsync(id);
  }, [deleteCategoryMutation]);

  const reorderCategories = useCallback(async (ids: string[]) => {
    await apiService.post('/user/categories/reorder', { ids });
    queryClient.invalidateQueries({ queryKey: QUERY_KEYS.categories });
  }, [queryClient]);

  const createTag = useCallback(async (name: string, color?: string) => {
    return createTagMutation.mutateAsync({ name, color });
  }, [createTagMutation]);

  const deleteTag = useCallback(async (id: string) => {
    await deleteTagMutation.mutateAsync(id);
  }, [deleteTagMutation]);

  const assignCategory = useCallback(async (conversationId: string, categoryId: string | null) => {
    await apiService.patch(`/conversations/${conversationId}`, { categoryId });
    queryClient.invalidateQueries({ queryKey: ['conversations'] });
  }, [queryClient]);

  const assignTags = useCallback(async (conversationId: string, tagIds: string[]) => {
    await apiService.patch(`/conversations/${conversationId}/tags`, { tagIds });
    queryClient.invalidateQueries({ queryKey: ['conversations'] });
  }, [queryClient]);

  return {
    categories,
    createCategory,
    updateCategory,
    deleteCategory,
    reorderCategories,
    tags,
    createTag,
    deleteTag,
    assignCategory,
    assignTags,
    isLoading: isLoadingCategories || isLoadingTags,
  };
}
```

### 3.4 Index des Hooks V2

**Fichier**: `hooks/v2/index.ts` (à mettre à jour)

```typescript
// Auth (existants)
export { useLoginV2 } from './use-login-v2';
export { useSignupV2 } from './use-signup-v2';

// Messaging (nouveaux)
export { useConversationsV2 } from './use-conversations-v2';
export type { UseConversationsV2Options, ConversationsV2Return } from './use-conversations-v2';

export { useMessagesV2 } from './use-messages-v2';
export type { UseMessagesV2Options, MessagesV2Return, SendMessageOptions } from './use-messages-v2';

export { useUserPreferencesV2 } from './use-user-preferences-v2';
export type { UseUserPreferencesV2Return, Category } from './use-user-preferences-v2';
```

---

## 4. Mapping Types Conversation

### 4.1 Transformation Backend -> Frontend

```typescript
// Types backend (depuis @meeshy/shared/types)
interface Conversation {
  id: string;
  type: ConversationType;
  title?: string;
  description?: string;
  image?: string;
  isActive: boolean;
  isArchived: boolean;
  lastMessageAt?: string;
  createdAt: string;
  updatedAt: string;
  members: ConversationMember[];
  lastMessage?: Message;
  unreadCount?: number;
}

// Type frontend V2 (ConversationItemData)
interface ConversationItemData {
  id: string;
  name: string;
  customName?: string;
  languageCode: string;  // 'multi' pour groupes
  isOnline: boolean;
  isPinned: boolean;
  isImportant: boolean;
  isMuted: boolean;
  isGroup?: boolean;
  participantCount?: number;
  hasAnonymousParticipants?: boolean;
  tags: ConversationTag[];
  categoryId?: string;
  unreadCount: number;
  lastMessage: {
    content: string;
    type: 'text' | 'photo' | 'video' | 'voice' | 'file' | 'link';
    attachmentCount?: number;
    timestamp: string;
    senderName?: string;  // Pour les groupes
  };
  draft?: string;
  isTyping: boolean;
}
```

### 4.2 Fonction de Transformation

```typescript
// utils/v2/transform-conversation.ts

import type { Conversation, Message } from '@meeshy/shared/types';
import type { ConversationItemData, ConversationTag } from '@/components/v2';
import { formatRelativeTime } from '@/utils/date';

export function transformToConversationItem(
  conversation: Conversation,
  options: {
    typingUserIds?: Set<string>;
    onlineUserIds?: Set<string>;
    currentUserId?: string;
  } = {}
): ConversationItemData {
  const { typingUserIds = new Set(), onlineUserIds = new Set(), currentUserId } = options;

  const isGroup = conversation.type === 'group' || conversation.type === 'community';
  const otherMembers = conversation.members?.filter(m => m.userId !== currentUserId) ?? [];

  // Déterminer le nom et la langue
  let name: string;
  let languageCode: string;

  if (isGroup) {
    name = conversation.title || 'Groupe';
    languageCode = 'multi';
  } else {
    const otherMember = otherMembers[0];
    name = otherMember?.user?.displayName
      || otherMember?.user?.username
      || 'Utilisateur';
    languageCode = otherMember?.user?.preferredLanguage || 'fr';
  }

  // Vérifier si en ligne (pour conversations directes)
  const isOnline = !isGroup && otherMembers.some(m => onlineUserIds.has(m.userId));

  // Transformer lastMessage
  const lastMessage = conversation.lastMessage;
  const lastMessageData = lastMessage ? {
    content: lastMessage.content || '',
    type: getMessageType(lastMessage),
    attachmentCount: lastMessage.attachments?.length,
    timestamp: formatRelativeTime(lastMessage.createdAt),
    senderName: isGroup ? lastMessage.sender?.displayName : undefined,
  } : {
    content: '',
    type: 'text' as const,
    timestamp: formatRelativeTime(conversation.createdAt),
  };

  // Vérifier si quelqu'un tape
  const isTyping = otherMembers.some(m => typingUserIds.has(m.userId));

  // Vérifier participants anonymes
  const hasAnonymousParticipants = conversation.members?.some(m => m.isAnonymous) ?? false;

  return {
    id: conversation.id,
    name,
    languageCode,
    isOnline,
    isPinned: conversation.isPinned ?? false,
    isImportant: conversation.isImportant ?? false,
    isMuted: conversation.isMuted ?? false,
    isGroup,
    participantCount: isGroup ? conversation.members?.length : undefined,
    hasAnonymousParticipants: isGroup ? hasAnonymousParticipants : undefined,
    tags: transformTags(conversation.tags),
    categoryId: conversation.categoryId,
    unreadCount: conversation.unreadCount ?? 0,
    lastMessage: lastMessageData,
    draft: conversation.draft,
    isTyping,
  };
}

function getMessageType(message: Message): 'text' | 'photo' | 'video' | 'voice' | 'file' | 'link' {
  if (message.attachments?.length) {
    const firstAttachment = message.attachments[0];
    if (firstAttachment.type?.startsWith('image/')) return 'photo';
    if (firstAttachment.type?.startsWith('video/')) return 'video';
    if (firstAttachment.type?.startsWith('audio/')) return 'voice';
    return 'file';
  }
  if (message.content?.match(/https?:\/\//)) return 'link';
  return 'text';
}

function transformTags(tags?: any[]): ConversationTag[] {
  if (!tags) return [];
  return tags.map(tag => ({
    id: tag.id,
    name: tag.name,
    color: tag.color,
  }));
}
```

---

## 5. Intégration Page V2 Chats

### 5.1 Refactoring de la Page

```typescript
// app/v2/chats/page.tsx

'use client';

import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  useConversationsV2,
  useMessagesV2,
  useUserPreferencesV2,
} from '@/hooks/v2';
import { useAuth } from '@/hooks/use-auth'; // ou useAuthV2
import { transformToConversationItem } from '@/utils/v2/transform-conversation';
import {
  ConversationItem,
  MessageBubble,
  MessageComposer,
  // ... autres imports
} from '@/components/v2';

export default function V2ChatsPage() {
  const router = useRouter();
  const messagesContainerRef = useRef<HTMLDivElement>(null);

  // Auth
  const { user, isAuthenticated, isLoading: isAuthLoading } = useAuth();

  // State local
  const [selectedChatId, setSelectedChatId] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Hooks V2
  const {
    conversations,
    currentConversation,
    isLoading: isLoadingConversations,
    hasMore: hasMoreConversations,
    loadMore: loadMoreConversations,
    pinnedConversations,
    uncategorizedConversations,
    isConnected,
    error: conversationsError,
  } = useConversationsV2(selectedChatId, {
    enabled: isAuthenticated,
  });

  const {
    messages,
    isLoading: isLoadingMessages,
    isLoadingMore: isLoadingMoreMessages,
    hasMore: hasMoreMessages,
    loadMore: loadMoreMessages,
    sendMessage,
    typingUsers,
    startTyping,
    stopTyping,
    error: messagesError,
  } = useMessagesV2(selectedChatId, user, {
    enabled: isAuthenticated && !!selectedChatId,
    containerRef: messagesContainerRef,
  });

  const {
    categories,
    tags,
    createCategory,
    deleteCategory,
    createTag,
    deleteTag,
    assignCategory,
    assignTags,
  } = useUserPreferencesV2();

  // Transformer les conversations pour les composants V2
  const transformedConversations = useMemo(() => {
    return conversations.map(conv => transformToConversationItem(conv, {
      currentUserId: user?.id,
      // typingUserIds et onlineUserIds peuvent être gérés globalement
    }));
  }, [conversations, user?.id]);

  // Grouper par catégorie
  const conversationsByCategory = useMemo(() => {
    const grouped = new Map<string, typeof transformedConversations>();
    const pinned: typeof transformedConversations = [];
    const uncategorized: typeof transformedConversations = [];

    transformedConversations.forEach(conv => {
      if (conv.isPinned) {
        pinned.push(conv);
      } else if (conv.categoryId) {
        const existing = grouped.get(conv.categoryId) || [];
        grouped.set(conv.categoryId, [...existing, conv]);
      } else {
        uncategorized.push(conv);
      }
    });

    return { pinned, grouped, uncategorized };
  }, [transformedConversations]);

  // Handlers
  const handleSendMessage = useCallback(async () => {
    if (!message.trim()) return;

    const success = await sendMessage(message, {
      language: user?.preferredLanguage || 'fr',
    });

    if (success) {
      setMessage('');
    }
  }, [message, sendMessage, user?.preferredLanguage]);

  const handleSelectChat = useCallback((id: string) => {
    setSelectedChatId(id);
  }, []);

  const handleConversationAction = useCallback(async (id: string, action: string) => {
    switch (action) {
      case 'pin':
        // API call pour toggle pin
        break;
      case 'mute':
        // API call pour toggle mute
        break;
      case 'archive':
        // API call pour archiver
        break;
      case 'delete':
        // Confirmation + API call
        break;
    }
  }, []);

  // Redirect si pas authentifié
  useEffect(() => {
    if (!isAuthLoading && !isAuthenticated) {
      router.push('/v2/login');
    }
  }, [isAuthLoading, isAuthenticated, router]);

  if (isAuthLoading) {
    return <LoadingScreen />;
  }

  // ... reste du JSX avec les données réelles
}
```

---

## 6. Gestion des Erreurs

### 6.1 Error Boundaries

```typescript
// components/v2/ErrorBoundary.tsx

import { Component, ReactNode } from 'react';
import { Button } from './Button';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onReset?: () => void;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class MessagingErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('Messaging error:', error, errorInfo);
    // Envoyer à un service de monitoring (Sentry, etc.)
  }

  handleReset = () => {
    this.setState({ hasError: false, error: undefined });
    this.props.onReset?.();
  };

  render() {
    if (this.state.hasError) {
      return this.props.fallback ?? (
        <div className="flex flex-col items-center justify-center p-8 text-center">
          <h2 className="text-lg font-semibold text-gray-800 mb-2">
            Une erreur est survenue
          </h2>
          <p className="text-gray-500 mb-4">
            Impossible de charger les messages. Veuillez réessayer.
          </p>
          <Button onClick={this.handleReset}>
            Réessayer
          </Button>
        </div>
      );
    }

    return this.props.children;
  }
}
```

### 6.2 Hook de Gestion d'Erreurs

```typescript
// hooks/v2/use-messaging-error.ts

import { useCallback, useState } from 'react';
import { toast } from 'sonner';

export interface MessagingError {
  code: string;
  message: string;
  recoverable: boolean;
}

const ERROR_MESSAGES: Record<string, MessagingError> = {
  NETWORK_ERROR: {
    code: 'NETWORK_ERROR',
    message: 'Connexion perdue. Vérifiez votre connexion internet.',
    recoverable: true,
  },
  RATE_LIMIT: {
    code: 'RATE_LIMIT',
    message: 'Trop de requêtes. Veuillez patienter.',
    recoverable: true,
  },
  UNAUTHORIZED: {
    code: 'UNAUTHORIZED',
    message: 'Session expirée. Veuillez vous reconnecter.',
    recoverable: false,
  },
  MESSAGE_SEND_FAILED: {
    code: 'MESSAGE_SEND_FAILED',
    message: "Échec de l'envoi du message. Réessayez.",
    recoverable: true,
  },
  CONVERSATION_NOT_FOUND: {
    code: 'CONVERSATION_NOT_FOUND',
    message: 'Cette conversation n\'existe plus.',
    recoverable: false,
  },
};

export function useMessagingError() {
  const [lastError, setLastError] = useState<MessagingError | null>(null);

  const handleError = useCallback((error: unknown, showToast = true) => {
    let messagingError: MessagingError;

    if (error instanceof Error) {
      const code = (error as any).code || 'UNKNOWN';
      messagingError = ERROR_MESSAGES[code] || {
        code: 'UNKNOWN',
        message: error.message || 'Une erreur inattendue est survenue.',
        recoverable: true,
      };
    } else {
      messagingError = {
        code: 'UNKNOWN',
        message: 'Une erreur inattendue est survenue.',
        recoverable: true,
      };
    }

    setLastError(messagingError);

    if (showToast) {
      toast.error(messagingError.message);
    }

    return messagingError;
  }, []);

  const clearError = useCallback(() => {
    setLastError(null);
  }, []);

  return {
    lastError,
    handleError,
    clearError,
  };
}
```

---

## 7. Tests Requis

### 7.1 Tests Unitaires

```typescript
// __tests__/hooks/v2/use-conversations-v2.test.tsx

import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useConversationsV2 } from '@/hooks/v2/use-conversations-v2';

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
};

describe('useConversationsV2', () => {
  it('should fetch conversations on mount', async () => {
    const { result } = renderHook(
      () => useConversationsV2(null),
      { wrapper: createWrapper() }
    );

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.conversations).toBeDefined();
  });

  it('should group conversations by category', async () => {
    const { result } = renderHook(
      () => useConversationsV2(null),
      { wrapper: createWrapper() }
    );

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.pinnedConversations).toBeDefined();
    expect(result.current.uncategorizedConversations).toBeDefined();
  });

  it('should load more conversations', async () => {
    const { result } = renderHook(
      () => useConversationsV2(null),
      { wrapper: createWrapper() }
    );

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    if (result.current.hasMore) {
      await result.current.loadMore();
      expect(result.current.conversations.length).toBeGreaterThan(0);
    }
  });
});
```

### 7.2 Tests d'Intégration

```typescript
// __tests__/hooks/v2/use-messages-v2.test.tsx

import { renderHook, act, waitFor } from '@testing-library/react';
import { useMessagesV2 } from '@/hooks/v2/use-messages-v2';

describe('useMessagesV2', () => {
  const mockUser = { id: 'user-1', displayName: 'Test User' };
  const conversationId = 'conv-1';

  it('should fetch messages for a conversation', async () => {
    const { result } = renderHook(
      () => useMessagesV2(conversationId, mockUser),
      { wrapper: createWrapper() }
    );

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.messages).toBeDefined();
  });

  it('should send a message with optimistic update', async () => {
    const { result } = renderHook(
      () => useMessagesV2(conversationId, mockUser),
      { wrapper: createWrapper() }
    );

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    const initialCount = result.current.messages.length;

    await act(async () => {
      await result.current.sendMessage('Test message');
    });

    // Vérifier l'ajout optimiste
    expect(result.current.messages.length).toBeGreaterThanOrEqual(initialCount);
  });

  it('should handle typing indicators', async () => {
    const { result } = renderHook(
      () => useMessagesV2(conversationId, mockUser),
      { wrapper: createWrapper() }
    );

    act(() => {
      result.current.startTyping();
    });

    // Le WebSocket devrait émettre un événement typing

    act(() => {
      result.current.stopTyping();
    });
  });
});
```

### 7.3 Tests E2E

```typescript
// e2e/messaging-v2.spec.ts (Playwright)

import { test, expect } from '@playwright/test';

test.describe('V2 Messaging', () => {
  test.beforeEach(async ({ page }) => {
    // Login
    await page.goto('/v2/login');
    await page.fill('[name="email"]', 'test@example.com');
    await page.fill('[name="password"]', 'password');
    await page.click('button[type="submit"]');
    await page.waitForURL('/v2/chats');
  });

  test('should display conversation list', async ({ page }) => {
    await expect(page.locator('[data-testid="conversation-list"]')).toBeVisible();
  });

  test('should select a conversation and load messages', async ({ page }) => {
    // Cliquer sur la première conversation
    await page.click('[data-testid="conversation-item"]:first-child');

    // Vérifier que les messages se chargent
    await expect(page.locator('[data-testid="messages-container"]')).toBeVisible();
    await expect(page.locator('[data-testid="message-bubble"]')).toHaveCount({ minimum: 0 });
  });

  test('should send a message', async ({ page }) => {
    await page.click('[data-testid="conversation-item"]:first-child');

    const composer = page.locator('[data-testid="message-composer"]');
    await composer.fill('Test message');
    await page.click('[data-testid="send-button"]');

    // Vérifier l'ajout du message
    await expect(page.locator('[data-testid="message-bubble"]').last()).toContainText('Test message');
  });

  test('should show typing indicator', async ({ page }) => {
    await page.click('[data-testid="conversation-item"]:first-child');

    const composer = page.locator('[data-testid="message-composer"]');
    await composer.fill('Typing...');

    // Le typing indicator devrait apparaître (simulé)
  });
});
```

---

## 8. Checklist d'Implémentation

### Phase 2.1 - Hooks de base
- [ ] Créer `hooks/v2/use-conversations-v2.ts`
- [ ] Créer `hooks/v2/use-messages-v2.ts`
- [ ] Créer `hooks/v2/use-user-preferences-v2.ts`
- [ ] Mettre à jour `hooks/v2/index.ts`

### Phase 2.2 - Utils
- [ ] Créer `utils/v2/transform-conversation.ts`
- [ ] Créer `utils/v2/transform-message.ts`
- [ ] Tests unitaires pour transformers

### Phase 2.3 - Intégration Page
- [ ] Remplacer `mockConversations` par `useConversationsV2`
- [ ] Remplacer `mockCategories` et `mockTags` par `useUserPreferencesV2`
- [ ] Connecter `MessageComposer` à `useMessagesV2`
- [ ] Afficher les vrais messages depuis l'API
- [ ] Implémenter le scroll infini pour les messages

### Phase 2.4 - Temps Réel
- [ ] Tester réception de nouveaux messages via WebSocket
- [ ] Implémenter indicateurs de typing
- [ ] Implémenter statut en ligne des utilisateurs

### Phase 2.5 - Tests
- [ ] Tests unitaires hooks
- [ ] Tests intégration
- [ ] Tests E2E

### Phase 2.6 - Error Handling
- [ ] Implémenter `MessagingErrorBoundary`
- [ ] Implémenter `useMessagingError`
- [ ] Ajouter gestion des erreurs réseau
- [ ] Ajouter retry automatique

---

## 9. Notes d'Architecture

### 9.1 Stratégie de Cache

```
React Query Cache
├── conversations.infinite    // Liste paginée (staleTime: Infinity)
├── conversations.detail.{id} // Détail conversation
├── messages.infinite.{id}    // Messages paginés par conversation
├── user.categories           // Catégories utilisateur
└── user.tags                 // Tags utilisateur

Invalidation:
- Nouveau message → MAJ conversations.infinite (lastMessage)
- Envoi message → Optimistic update messages + rollback si erreur
- WebSocket reconnect → Refetch conversations actives
```

### 9.2 Flow de Données

```
User Action
    ↓
Hook V2 (useMessagesV2)
    ↓
├── Optimistic Update (React Query cache)
├── WebSocket emit
│   └── Server processes
│       └── WebSocket broadcast
│           └── All clients receive
│               └── Update React Query cache
│                   └── UI re-renders
└── Fallback: REST API (si WebSocket down)
```

### 9.3 Considérations Performance

1. **Virtualization**: Pour les longues listes de messages, utiliser `react-window` ou `@tanstack/react-virtual`
2. **Debounce**: Debounce la recherche et les indicateurs de typing
3. **Memoization**: `useMemo` pour les transformations de données
4. **Lazy Loading**: Charger les images/médias à la demande

---

## Annexe: Endpoints API

### Conversations
| Méthode | Endpoint | Description |
|---------|----------|-------------|
| GET | `/conversations` | Liste des conversations |
| GET | `/conversations/:id` | Détail conversation |
| POST | `/conversations` | Créer conversation |
| PATCH | `/conversations/:id` | Modifier conversation |
| DELETE | `/conversations/:id` | Supprimer conversation |
| POST | `/conversations/:id/read` | Marquer comme lu |

### Messages
| Méthode | Endpoint | Description |
|---------|----------|-------------|
| GET | `/conversations/:id/messages` | Liste des messages |
| POST | `/conversations/:id/messages` | Envoyer message |
| PATCH | `/messages/:id` | Modifier message |
| DELETE | `/messages/:id` | Supprimer message |

### User Preferences
| Méthode | Endpoint | Description |
|---------|----------|-------------|
| GET | `/user/categories` | Liste catégories |
| POST | `/user/categories` | Créer catégorie |
| PATCH | `/user/categories/:id` | Modifier catégorie |
| DELETE | `/user/categories/:id` | Supprimer catégorie |
| GET | `/user/tags` | Liste tags |
| POST | `/user/tags` | Créer tag |
| DELETE | `/user/tags/:id` | Supprimer tag |
