'use client';

import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/react-query/query-keys';
import { meeshySocketIOService } from '@/services/meeshy-socketio.service';
import { apiService } from '@/services/api.service';
import { useAuthStore } from '@/stores/auth-store';
import type { Message, Conversation } from '@/types';
import type { TranslationEvent } from '@meeshy/shared/types';
import type { SocketIOTranslation } from '@meeshy/shared/types/attachment-audio';
import type { AudioTranslationReadyEventData } from '@meeshy/shared/types/socketio-events';
import type { OptimisticMessage } from '@/utils/optimistic-message';

function isOptimisticMessage(m: Message): m is OptimisticMessage {
  return '_tempId' in m;
}

type CachedMessage = Message & {
  translatedAudios?: Record<string, SocketIOTranslation>;
};

type InfiniteConversationData = {
  pages: { conversations: Conversation[]; pagination: any }[];
  pageParams: number[];
};

function updateInfiniteConversationCache(
  queryClient: ReturnType<typeof useQueryClient>,
  updater: (conversations: Conversation[]) => Conversation[]
): void {
  queryClient.setQueryData(
    queryKeys.conversations.infinite(),
    (old: InfiniteConversationData | undefined) => {
      if (!old) return old;
      const allConversations = old.pages.flatMap(page => page.conversations);
      const updated = updater(allConversations);
      if (updated === allConversations) return old;

      // PRESERVE PAGE STRUCTURE. Previously this code collapsed every
      // existing page into a single synthetic page with `pageParams: [0]`
      // and `pagination.offset: 0` — meaning the next `fetchNextPage`
      // call recomputed `getNextPageParam` against that single fused
      // page and either re-fetched offset=0 (re-loading already-loaded
      // conversations as duplicates) or stalled if the synthetic
      // `hasMore` didn't propagate. By rebuilding the original page
      // boundaries from the updated array, `pageParams` stay intact and
      // infinite scroll keeps advancing past the last real page.
      const rebuiltPages: typeof old.pages = [];
      let cursor = 0;
      for (let i = 0; i < old.pages.length; i++) {
        const originalPage = old.pages[i];
        const originalLength = originalPage.conversations.length;
        const slice = updated.slice(cursor, cursor + originalLength);
        rebuiltPages.push({
          conversations: slice,
          pagination: {
            // Keep the original pagination metadata so `getNextPageParam`
            // continues to see correct offsets/limits.
            ...originalPage.pagination,
            // `total` is the only field worth refreshing — the global
            // count grows when a brand-new conversation is prepended.
            total: i === old.pages.length - 1 ? updated.length : originalPage.pagination.total,
          },
        });
        cursor += originalLength;
      }
      // Tail: any items the updater added beyond the original total
      // length (e.g. a brand-new conversation prepended via fetch
      // fallback). Append them as an extra page so they're not lost.
      if (cursor < updated.length) {
        const last = old.pages[old.pages.length - 1];
        rebuiltPages.push({
          conversations: updated.slice(cursor),
          pagination: {
            ...last.pagination,
            offset: cursor,
            total: updated.length,
          },
        });
      }

      return {
        pages: rebuiltPages,
        pageParams: old.pageParams,
      };
    }
  );
}

interface UseSocketCacheSyncOptions {
  conversationId?: string | null;
  enabled?: boolean;
}

export function useSocketCacheSync(options: UseSocketCacheSyncOptions = {}) {
  const { conversationId, enabled = true } = options;
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!enabled) return;

    // Handler for new messages
    const handleNewMessage = (message: Message) => {
      const targetConversationId = message.conversationId;

      // Update infinite messages query
      queryClient.setQueryData(
        queryKeys.messages.infinite(targetConversationId),
        (old: { pages: { messages: Message[]; hasMore: boolean; total: number }[]; pageParams: number[] } | undefined) => {
          if (!old) return old;

          // Single-pass: ID dedup + own-message optimistic replacement
          const currentUser = useAuthStore.getState().user;
          const isOwnMessage = currentUser && message.senderId === currentUser.id;
          let optimisticTempId: string | null = null;
          let bestTimeDiff = Infinity;

          for (const page of old.pages) {
            for (const m of page.messages) {
              if (m.id === message.id) return old; // already have this server message

              // Dédup par _serverMessageId : le ACK a stocké le messageId serveur
              // sur le message optimiste (sans changer son id/key React).
              // Quand le broadcast arrive, on remplace atomiquement.
              if (isOwnMessage && (m as any)._serverMessageId === message.id) {
                optimisticTempId = (m as any)._tempId ?? m.id;
                break;
              }

              // Fallback : dédup par timestamp pour le cas où le broadcast
              // arrive AVANT le ACK (optimiste encore en status 'sending')
              if (isOwnMessage && isOptimisticMessage(m) && m._localStatus === 'sending') {
                const timeDiff = Math.abs(
                  new Date(message.createdAt).getTime() - new Date(m.createdAt).getTime()
                );
                if (timeDiff < 5000 && timeDiff < bestTimeDiff) {
                  bestTimeDiff = timeDiff;
                  optimisticTempId = m._tempId;
                }
              }
            }
            if (optimisticTempId) break;
          }

          // Replace optimistic if found (prevents duplicate)
          if (optimisticTempId) {
            const targetTempId = optimisticTempId;
            return {
              ...old,
              pages: old.pages.map(page => ({
                ...page,
                messages: page.messages.map(m => {
                  const mTempId = (m as any)._tempId ?? null;
                  const mServerId = (m as any)._serverMessageId ?? null;
                  if (mTempId === targetTempId || mServerId === message.id) {
                    return message;
                  }
                  return m;
                }),
              })),
            };
          }

          return {
            ...old,
            pages: old.pages.map((page, index) =>
              index === 0
                ? { ...page, messages: [message, ...page.messages] }
                : page
            ),
          };
        }
      );

      // Update simple messages list
      queryClient.setQueryData<Message[]>(
        queryKeys.messages.list(targetConversationId),
        (old) => {
          if (!old) return [message];
          if (old.some((m) => m.id === message.id)) return old;
          return [message, ...old];
        }
      );

      // Update ALL conversation list variants with latest message AND move to top
      queryClient.setQueriesData<Conversation[]>(
        { queryKey: queryKeys.conversations.lists() },
        (old) => {
          if (!old) return old;

          let updated: Conversation | null = null;
          const rest: Conversation[] = [];
          for (const conv of old) {
            if (conv.id === targetConversationId) {
              updated = {
                ...conv,
                lastMessage: message,
                lastMessageAt: message.createdAt,
                updatedAt: message.createdAt,
              };
            } else {
              rest.push(conv);
            }
          }

          if (!updated) return old;
          return [updated, ...rest];
        }
      );

      // Update infinite conversations query (paginated cache used by ConversationList)
      let conversationFoundInCache = false;
      updateInfiniteConversationCache(queryClient, (convs) => {
        let updated: Conversation | null = null;
        const rest: Conversation[] = [];
        for (const conv of convs) {
          if (conv.id === targetConversationId) {
            updated = { ...conv, lastMessage: message, lastMessageAt: message.createdAt, updatedAt: message.createdAt };
          } else {
            rest.push(conv);
          }
        }
        if (updated) {
          conversationFoundInCache = true;
          return [updated, ...rest];
        }
        return convs;
      });

      // First time this client sees the conversation (brand-new DM,
      // group invite the user just got added to, or a record missed
      // by the paginated initial query). Fetch the full row from the
      // API and prepend it so the list surfaces the new chat in real
      // time instead of waiting for the next manual refresh.
      if (!conversationFoundInCache && /^[a-f\d]{24}$/i.test(targetConversationId)) {
        if (typeof window === 'undefined' || window.location.pathname !== '/login') {
          apiService.get<Conversation>(`/conversations/${targetConversationId}`)
            .then((response) => {
              const fetched = response?.data;
              if (!fetched) return;
              updateInfiniteConversationCache(queryClient, (convs) => {
                // Defensive dedup: a concurrent fetch / socket event
                // might have inserted while we were awaiting the API.
                const filtered = convs.filter((c) => c.id !== targetConversationId);
                const enriched: Conversation = {
                  ...fetched,
                  lastMessage: message,
                  lastMessageAt: message.createdAt,
                  updatedAt: message.createdAt,
                };
                return [enriched, ...filtered];
              });
            })
            .catch((err: unknown) => {
              console.warn('[SOCKET_SYNC] Failed to fetch missing conversation:', err);
            });
        }
      }

      // DO NOT invalidate here - setQueryData already has the correct lastMessage
      // Invalidating would trigger a re-fetch that could return stale data from backend cache
      // The backend may not have processed the message yet when we re-fetch

      // Auto mark-as-received for messages from other users
      // senderId is now always a User ID (resolved in message converters)
      const currentUser = useAuthStore.getState().user;
      if (currentUser && message.senderId !== currentUser.id && /^[a-f\d]{24}$/i.test(message.conversationId)) {
        // Prevent background API calls if on login page to avoid infinite reload loops
        if (typeof window !== 'undefined' && window.location.pathname !== '/login') {
          apiService.post(`/conversations/${message.conversationId}/mark-as-received`)
            .catch(() => {}); // Non-critical, fire-and-forget
        }
      }
    };

    // Handler for edited messages
    const handleMessageEdited = (message: Message) => {
      const targetConversationId = message.conversationId;

      queryClient.setQueryData(
        queryKeys.messages.infinite(targetConversationId),
        (old: { pages: { messages: Message[]; hasMore: boolean; total: number }[]; pageParams: number[] } | undefined) => {
          if (!old) return old;
          return {
            ...old,
            pages: old.pages.map((page) => ({
              ...page,
              messages: page.messages.map((m) =>
                m.id === message.id ? { ...m, ...message } : m
              ),
            })),
          };
        }
      );

      // Update lastMessage in ALL conversation list variants if this edited message is the last one
      queryClient.setQueriesData<Conversation[]>(
        { queryKey: queryKeys.conversations.lists() },
        (old) => {
          if (!old) return old;
          return old.map((conv) => {
            if (conv.id === targetConversationId && conv.lastMessage?.id === message.id) {
              return { ...conv, lastMessage: message };
            }
            return conv;
          });
        }
      );
      updateInfiniteConversationCache(queryClient, (convs) =>
        convs.map((conv) =>
          conv.id === targetConversationId && conv.lastMessage?.id === message.id
            ? { ...conv, lastMessage: message }
            : conv
        )
      );
    };

    // Handler for deleted messages
    const handleMessageDeleted = (messageId: string) => {
      const removeFromCache = (targetConversationId: string) => {
        queryClient.setQueryData(
          queryKeys.messages.infinite(targetConversationId),
          (old: { pages: { messages: Message[]; hasMore: boolean; total: number }[]; pageParams: number[] } | undefined) => {
            if (!old) return old;
            return {
              ...old,
              pages: old.pages.map((page) => ({
                ...page,
                messages: page.messages
                  .filter((m) => m.id !== messageId)
                  .map((m) =>
                    m.replyToId === messageId
                      ? { ...m, replyToId: undefined, replyTo: undefined }
                      : m
                  ),
              })),
            };
          }
        );
      };

      if (conversationId) {
        removeFromCache(conversationId);
      } else {
        // No conversationId available — scan all cached infinite message queries
        // and remove the message from whichever conversation contains it.
        // This avoids invalidating ALL message queries which causes mass refetching.
        const queryCache = queryClient.getQueryCache();
        const messageQueries = queryCache.findAll({ queryKey: queryKeys.messages.all });
        for (const query of messageQueries) {
          const data = query.state.data as { pages?: { messages?: Message[] }[] } | undefined;
          if (!data?.pages) continue;
          const found = data.pages.some(
            (page) => page.messages?.some((m) => m.id === messageId)
          );
          if (found) {
            // Extract conversationId from the query key (format: ['messages', 'list', convId, ...])
            const convId = query.queryKey[2] as string;
            if (convId) removeFromCache(convId);
            break;
          }
        }
      }
    };

    // Handler for message translations — merges as Translation[] array (not Record)
    const handleTranslation = (data: TranslationEvent) => {
      if (!conversationId) return;

      queryClient.setQueryData(
        queryKeys.messages.infinite(conversationId),
        (old: { pages: { messages: Message[]; hasMore: boolean; total: number }[]; pageParams: number[] } | undefined) => {
          if (!old) return old;
          return {
            ...old,
            pages: old.pages.map((page) => ({
              ...page,
              messages: page.messages.map((m) => {
                if (m.id !== data.messageId) return m;

                // Merge translations as array, dedup by targetLanguage
                const existingTranslations = Array.isArray(m.translations) ? [...m.translations] : [];
                for (const t of data.translations) {
                  const targetLang = t.targetLanguage;
                  const idx = existingTranslations.findIndex((et) => et.targetLanguage === targetLang);
                  if (idx >= 0) existingTranslations[idx] = t;
                  else existingTranslations.push(t);
                }

                return {
                  ...m,
                  translations: existingTranslations,
                };
              }),
            })),
          };
        }
      );
    };

    // Handler for unread count updates — applies to ALL conversation list variants (filtered, unfiltered)
    const handleUnreadUpdated = (data: { conversationId: string; unreadCount: number }) => {
      queryClient.setQueriesData<Conversation[]>(
        { queryKey: queryKeys.conversations.lists() },
        (old) =>
          old?.map((conv) =>
            conv.id === data.conversationId
              ? { ...conv, unreadCount: data.unreadCount }
              : conv
          )
      );
      updateInfiniteConversationCache(queryClient, (convs) =>
        convs.map((conv) =>
          conv.id === data.conversationId
            ? { ...conv, unreadCount: data.unreadCount }
            : conv
        )
      );
    };

    const handleParticipantRoleUpdated = (data: { conversationId: string; userId: string; newRole: string }) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.conversations.participants(data.conversationId),
      });
    };

    // W6: Handler for transcription results — updates attachment transcription in cache
    const handleTranscription = (data: { messageId: string; transcription: string; language?: string; [key: string]: unknown }) => {
      if (!conversationId) return;

      queryClient.setQueryData(
        queryKeys.messages.infinite(conversationId),
        (old: { pages: { messages: Message[]; hasMore: boolean; total: number }[]; pageParams: number[] } | undefined) => {
          if (!old) return old;
          return {
            ...old,
            pages: old.pages.map((page) => ({
              ...page,
              messages: page.messages.map((m) => {
                if (m.id !== data.messageId) return m;
                // Attach transcription to the first audio attachment or at message level
                const attachments = Array.isArray(m.attachments) ? [...m.attachments] : [];
                const audioIdx = attachments.findIndex((a) => a.mimeType?.startsWith('audio/'));
                if (audioIdx >= 0) {
                  attachments[audioIdx] = { ...attachments[audioIdx], transcription: data.transcription, transcriptionLanguage: data.language };
                }
                return { ...m, attachments, transcription: data.transcription, transcriptionLanguage: data.language };
              }),
            })),
          };
        }
      );
    };

    // W6: Handler for audio translation ready — updates attachment with translated audio URL
    const handleAudioTranslation = (data: AudioTranslationReadyEventData) => {
      if (!conversationId) return;

      const targetLang = data.translatedAudio.targetLanguage;
      queryClient.setQueryData(
        queryKeys.messages.infinite(conversationId),
        (old: { pages: { messages: Message[]; hasMore: boolean; total: number }[]; pageParams: number[] } | undefined) => {
          if (!old) return old;
          return {
            ...old,
            pages: old.pages.map((page) => ({
              ...page,
              messages: page.messages.map((m) => {
                if (m.id !== data.messageId) return m;
                // Store translated audio metadata keyed by target language
                const translatedAudios = { ...((m as CachedMessage).translatedAudios || {}) };
                translatedAudios[targetLang] = data.translatedAudio as unknown as SocketIOTranslation;
                return { ...m, translatedAudios };
              }),
            })),
          };
        }
      );
    };

    // Handler for participant joined — update memberCount in conversation lists
    const handleConversationJoined = (data: { conversationId: string; userId: string }) => {
      const joinUpdater = (convs: Conversation[]) =>
        convs.map((conv) =>
          conv.id === data.conversationId
            ? { ...conv, memberCount: (conv.memberCount ?? 0) + 1 }
            : conv
        );
      queryClient.setQueriesData<Conversation[]>(
        { queryKey: queryKeys.conversations.lists() },
        (old) => old ? joinUpdater(old) : old
      );
      updateInfiniteConversationCache(queryClient, joinUpdater);
      queryClient.invalidateQueries({
        queryKey: queryKeys.conversations.participants(data.conversationId),
      });
    };

    // Handler for participant left — update memberCount in conversation lists
    const handleConversationLeft = (data: { conversationId: string; userId: string }) => {
      const leftUpdater = (convs: Conversation[]) =>
        convs.map((conv) =>
          conv.id === data.conversationId
            ? { ...conv, memberCount: Math.max(0, (conv.memberCount ?? 1) - 1) }
            : conv
        );
      queryClient.setQueriesData<Conversation[]>(
        { queryKey: queryKeys.conversations.lists() },
        (old) => old ? leftUpdater(old) : old
      );
      updateInfiniteConversationCache(queryClient, leftUpdater);
      queryClient.invalidateQueries({
        queryKey: queryKeys.conversations.participants(data.conversationId),
      });
    };

    // Handler for participant-left (room broadcast) — another member was removed/left
    const handleConversationParticipantLeft = (data: { conversationId: string; userId: string; displayName: string; leftAt: string }) => {
      const leftUpdater = (convs: Conversation[]) =>
        convs.map((conv) =>
          conv.id === data.conversationId
            ? { ...conv, memberCount: Math.max(0, (conv.memberCount ?? 1) - 1) }
            : conv
        );
      queryClient.setQueriesData<Conversation[]>(
        { queryKey: queryKeys.conversations.lists() },
        (old) => old ? leftUpdater(old) : old
      );
      updateInfiniteConversationCache(queryClient, leftUpdater);
      queryClient.invalidateQueries({
        queryKey: queryKeys.conversations.participants(data.conversationId),
      });
    };

    // Handler for participant-banned — member was banned from the conversation
    const handleConversationParticipantBanned = (data: { conversationId: string; userId: string; bannedBy: { id: string }; bannedAt: string }) => {
      const bannedUpdater = (convs: Conversation[]) =>
        convs.map((conv) =>
          conv.id === data.conversationId
            ? { ...conv, memberCount: Math.max(0, (conv.memberCount ?? 1) - 1) }
            : conv
        );
      queryClient.setQueriesData<Conversation[]>(
        { queryKey: queryKeys.conversations.lists() },
        (old) => old ? bannedUpdater(old) : old
      );
      updateInfiniteConversationCache(queryClient, bannedUpdater);
      queryClient.invalidateQueries({
        queryKey: queryKeys.conversations.participants(data.conversationId),
      });
    };

    // Handler for participant-unbanned — member was unbanned (may rejoin)
    const handleConversationParticipantUnbanned = (data: { conversationId: string; userId: string }) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.conversations.participants(data.conversationId),
      });
    };

    // Handler for conversation:closed — conversation permanently closed by admin
    const handleConversationClosed = (data: { conversationId: string; closedBy: string; closedAt: string }) => {
      const { conversationId: closedId } = data;
      if (!closedId) return;
      updateInfiniteConversationCache(queryClient, (convs) =>
        convs.filter((c) => c.id !== closedId)
      );
      queryClient.removeQueries({ queryKey: queryKeys.conversations.detail(closedId) });
    };

    // Handler for category CRUD events — invalidate categories cache so sidebar reflects cross-device changes
    const handleCategoryChanged = () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.preferences.categories() });
    };

    // Handler for message:pending-delivered — queued messages delivered on reconnect.
    // Use targeted per-conversation invalidation to avoid a broad cache flush.
    const handlePendingMessagesDelivered = (data: { count: number; conversationIds: string[] }) => {
      const affected = data?.conversationIds ?? [];
      if (affected.length > 0) {
        for (const convId of affected) {
          queryClient.invalidateQueries({ queryKey: queryKeys.messages.infinite(convId) });
        }
      } else if (conversationId) {
        // Fallback for old server versions without conversationIds
        queryClient.invalidateQueries({ queryKey: queryKeys.messages.infinite(conversationId) });
      }
      // Always refresh conversation list to update lastMessageAt / unread counts
      queryClient.invalidateQueries({ queryKey: queryKeys.conversations.all });
    };

    // Handler for message:attachment-updated — async enrichment (transcription/translation) completed for an attachment
    const handleMessageAttachmentUpdated = (data: { conversationId: string; messageId: string; attachment: unknown }) => {
      const { conversationId: attachConvId, messageId: attachMsgId, attachment } = data;
      if (!attachConvId || !attachMsgId || !attachment) return;
      const attachId = (attachment as { id?: string }).id;
      queryClient.setQueryData(
        queryKeys.messages.infinite(attachConvId),
        (old: { pages: { messages: Message[]; hasMore: boolean; total: number }[]; pageParams: number[] } | undefined) => {
          if (!old) return old;
          return {
            ...old,
            pages: old.pages.map((page) => ({
              ...page,
              messages: page.messages.map((m) => {
                if (m.id !== attachMsgId) return m;
                const attachments = Array.isArray((m as any).attachments)
                  ? (m as any).attachments.map((a: { id?: string }) =>
                      attachId && a.id === attachId ? { ...a, ...attachment as object } : a
                    )
                  : (m as any).attachments;
                return { ...m, attachments };
              }),
            })),
          };
        }
      );
    };

    // Handler for message:pinned — update message in cache with pin metadata
    const handleMessagePinned = (data: { messageId: string; conversationId: string; pinnedBy: string; pinnedAt: string }) => {
      const { conversationId: pinnedConvId, messageId: pinnedMsgId, pinnedBy, pinnedAt } = data;
      if (!pinnedConvId || !pinnedMsgId) return;
      queryClient.setQueryData(
        queryKeys.messages.infinite(pinnedConvId),
        (old: { pages: { messages: Message[]; hasMore: boolean; total: number }[]; pageParams: number[] } | undefined) => {
          if (!old) return old;
          return {
            ...old,
            pages: old.pages.map((page) => ({
              ...page,
              messages: page.messages.map((m) =>
                m.id === pinnedMsgId ? { ...m, pinnedBy, pinnedAt } : m
              ),
            })),
          };
        }
      );
    };

    // Handler for message:unpinned — clear pin metadata from message in cache
    const handleMessageUnpinned = (data: { messageId: string; conversationId: string }) => {
      const { conversationId: unpinnedConvId, messageId: unpinnedMsgId } = data;
      if (!unpinnedConvId || !unpinnedMsgId) return;
      queryClient.setQueryData(
        queryKeys.messages.infinite(unpinnedConvId),
        (old: { pages: { messages: Message[]; hasMore: boolean; total: number }[]; pageParams: number[] } | undefined) => {
          if (!old) return old;
          return {
            ...old,
            pages: old.pages.map((page) => ({
              ...page,
              messages: page.messages.map((m) => {
                if (m.id !== unpinnedMsgId) return m;
                const { pinnedBy: _pb, pinnedAt: _pa, ...rest } = m as Message & { pinnedBy?: string; pinnedAt?: string };
                return rest as Message;
              }),
            })),
          };
        }
      );
    };

    // Handler for link:message:new — a link preview message arrived; append to messages + bump conversation
    const handleLinkMessageNew = (data: { message: Record<string, unknown> }) => {
      const linkMsg = data.message;
      const linkConvId = linkMsg.conversationId as string | undefined;
      if (!linkConvId) return;
      const linkMsgId = linkMsg.id as string | undefined;

      queryClient.setQueryData(
        queryKeys.messages.infinite(linkConvId),
        (old: { pages: { messages: Message[]; hasMore: boolean; total: number }[]; pageParams: number[] } | undefined) => {
          if (!old) return old;
          if (linkMsgId && old.pages.some((p) => p.messages.some((m) => m.id === linkMsgId))) return old;
          return {
            ...old,
            pages: old.pages.map((page, i) =>
              i === 0 ? { ...page, messages: [linkMsg as unknown as Message, ...page.messages] } : page
            ),
          };
        }
      );

      queryClient.setQueriesData<Conversation[]>(
        { queryKey: queryKeys.conversations.lists() },
        (old) => {
          if (!old) return old;
          const idx = old.findIndex((c) => c.id === linkConvId);
          if (idx === -1) return old;
          const updated = { ...old[idx], lastMessage: linkMsg as unknown as Message, lastMessageAt: linkMsg.createdAt as string ?? new Date().toISOString() };
          return [updated, ...old.filter((_, i) => i !== idx)];
        }
      );

      updateInfiniteConversationCache(queryClient, (convs) => {
        const idx = convs.findIndex((c) => c.id === linkConvId);
        if (idx === -1) return convs;
        const updated = { ...convs[idx], lastMessage: linkMsg as unknown as Message, lastMessageAt: linkMsg.createdAt as string ?? new Date().toISOString() };
        return [updated, ...convs.filter((_, i) => i !== idx)];
      });
    };

    // Handler for conversation:join-error — server rejected the room join; purge stale local cache
    const handleConversationJoinError = (data: { conversationId: string; reason: string; message: string }) => {
      const { conversationId: rejectedId, reason } = data;
      if (!rejectedId) return;
      updateInfiniteConversationCache(queryClient, (convs) => convs.filter((c) => c.id !== rejectedId));
      queryClient.setQueriesData<Conversation[]>(
        { queryKey: queryKeys.conversations.lists() },
        (old) => (old ? old.filter((c) => c.id !== rejectedId) : old)
      );
      queryClient.removeQueries({ queryKey: queryKeys.conversations.detail(rejectedId) });
      queryClient.removeQueries({ queryKey: queryKeys.messages.infinite(rejectedId) });
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('meeshy:conversation-join-error', { detail: { conversationId: rejectedId, reason } }));
      }
    };

    // Handler for attachment status updated (listened, watched, viewed, downloaded)
    const handleAttachmentStatusUpdated = (data: { attachmentId: string; messageId: string; conversationId: string; userId: string; action: string }) => {
      const targetConversationId = data.conversationId;
      if (!targetConversationId) return;

      queryClient.setQueryData(
        queryKeys.messages.infinite(targetConversationId),
        (old: { pages: { messages: Message[]; hasMore: boolean; total: number }[]; pageParams: number[] } | undefined) => {
          if (!old) return old;
          return {
            ...old,
            pages: old.pages.map((page) => ({
              ...page,
              messages: page.messages.map((m) => {
                if (m.id !== data.messageId) return m;
                const attachments = Array.isArray(m.attachments) ? m.attachments.map((a: any) => {
                  if (a.id !== data.attachmentId) return a;
                  const updates: Record<string, unknown> = {};
                  if (data.action === 'listened') updates.listenedAt = new Date().toISOString();
                  if (data.action === 'watched') updates.watchedAt = new Date().toISOString();
                  if (data.action === 'viewed') updates.viewedAt = new Date().toISOString();
                  if (data.action === 'downloaded') updates.downloadedAt = new Date().toISOString();
                  return { ...a, ...updates };
                }) : m.attachments;
                return { ...m, attachments };
              }),
            })),
          };
        }
      );
    };

    // Handler for conversation:deleted — user removed the conversation for themselves.
    const handleConversationDeleted = (data: { userId: string; conversationId: string }) => {
      const { conversationId: deletedId } = data;
      if (!deletedId) return;
      updateInfiniteConversationCache(queryClient, (convs) =>
        convs.filter((c) => c.id !== deletedId)
      );
      queryClient.removeQueries({ queryKey: queryKeys.conversations.detail(deletedId) });
    };

    // Handler for conversation:updated — metadata changed (title, settings) or lastMessage bump.
    const handleConversationUpdated = (data: { conversationId: string; updatedBy: { id: string }; updatedAt: string; [key: string]: unknown }) => {
      const { conversationId: updatedId, updatedBy: _updatedBy, ...rest } = data;
      if (!updatedId) return;
      updateInfiniteConversationCache(queryClient, (convs) =>
        convs.map((c) => c.id === updatedId ? { ...c, ...rest } : c)
      );
    };

    // Handler for user:updated — a contact's profile changed (displayName,
    // avatar, banner, username). Invalidate the cached profile so any
    // currently-mounted `useUserProfileQuery(userId)` refetches instead of
    // showing a stale snapshot until the next manual refresh.
    const handleUserUpdated = (data: { userId: string; changes: Record<string, unknown> }) => {
      if (!data?.userId) return;
      queryClient.invalidateQueries({ queryKey: queryKeys.users.detail(data.userId) });
    };

    // Handler for conversation:new — a group was created or the user was added to one.
    // The event carries only partial data, so fetch the full conversation and prepend it.
    const handleConversationNew = (data: { conversationId: string }) => {
      const { conversationId: newConvId } = data;
      if (!newConvId || !/^[a-f\d]{24}$/i.test(newConvId)) return;
      if (typeof window === 'undefined' || window.location.pathname === '/login') return;

      let alreadyInCache = false;
      updateInfiniteConversationCache(queryClient, (convs) => {
        if (convs.some((c) => c.id === newConvId)) {
          alreadyInCache = true;
        }
        return convs;
      });
      if (alreadyInCache) return;

      apiService.get<Conversation>(`/conversations/${newConvId}`)
        .then((response) => {
          const fetched = response?.data;
          if (!fetched) return;
          updateInfiniteConversationCache(queryClient, (convs) => {
            if (convs.some((c) => c.id === newConvId)) return convs;
            return [fetched, ...convs];
          });
        })
        .catch(() => {
          queryClient.invalidateQueries({ queryKey: queryKeys.conversations.all });
        });
    };

    // Register listeners
    const unsubscribeMessage = meeshySocketIOService.onNewMessage(handleNewMessage);
    const unsubscribeEdit = meeshySocketIOService.onMessageEdited(handleMessageEdited);
    const unsubscribeDelete = meeshySocketIOService.onMessageDeleted(handleMessageDeleted);
    const unsubscribeTranslation = meeshySocketIOService.onTranslation(handleTranslation);
    const unsubscribeUnread = meeshySocketIOService.onUnreadUpdated(handleUnreadUpdated);
    const unsubscribeTranscription = meeshySocketIOService.onTranscription(handleTranscription);
    const unsubscribeAudioTranslation = meeshySocketIOService.onAudioTranslation(handleAudioTranslation);
    const unsubscribeAttachmentStatus = meeshySocketIOService.onAttachmentStatusUpdated(handleAttachmentStatusUpdated);
    const unsubscribePreferences = meeshySocketIOService.onPreferencesUpdated((data) => {
      // The event is a union: user-level (has `category`) vs conversation-scoped
      // (has `conversationId`). Web cache invalidation here only cares about the
      // user-level variant; the conversation-scoped variant is consumed by the
      // new ConversationStore (iOS first; web wiring lands in a later phase).
      if ('category' in data) {
        queryClient.invalidateQueries({
          queryKey: queryKeys.preferences.category(data.category),
        });
      }
    });
    const unsubscribeJoined = meeshySocketIOService.onConversationJoined(handleConversationJoined);
    const unsubscribeLeft = meeshySocketIOService.onConversationLeft(handleConversationLeft);
    const unsubscribeParticipantRole = meeshySocketIOService.onParticipantRoleUpdated(handleParticipantRoleUpdated);
    const unsubscribeConversationNew = meeshySocketIOService.onConversationNew(handleConversationNew);
    const unsubscribeConversationDeleted = meeshySocketIOService.onConversationDeleted(handleConversationDeleted);
    const unsubscribeConversationUpdated = meeshySocketIOService.onConversationUpdated(handleConversationUpdated);
    const unsubscribeParticipantLeft = meeshySocketIOService.onConversationParticipantLeft(handleConversationParticipantLeft);
    const unsubscribeParticipantBanned = meeshySocketIOService.onConversationParticipantBanned(handleConversationParticipantBanned);
    const unsubscribeParticipantUnbanned = meeshySocketIOService.onConversationParticipantUnbanned(handleConversationParticipantUnbanned);
    const unsubscribeConversationClosed = meeshySocketIOService.onConversationClosed(handleConversationClosed);
    const unsubscribeCategoryChanged = meeshySocketIOService.onCategoryChanged(handleCategoryChanged);
    const unsubscribeMessageAttachmentUpdated = meeshySocketIOService.onMessageAttachmentUpdated(handleMessageAttachmentUpdated);
    const unsubscribePendingDelivered = meeshySocketIOService.onPendingMessagesDelivered(handlePendingMessagesDelivered);
    const unsubscribeLinkMessageNew = meeshySocketIOService.onLinkMessageNew(handleLinkMessageNew);
    const unsubscribeConversationJoinError = meeshySocketIOService.onConversationJoinError(handleConversationJoinError);
    const unsubscribeMessagePinned = meeshySocketIOService.onMessagePinned(handleMessagePinned);
    const unsubscribeMessageUnpinned = meeshySocketIOService.onMessageUnpinned(handleMessageUnpinned);
    const unsubscribeUserUpdated = meeshySocketIOService.onUserUpdated(handleUserUpdated);

    return () => {
      unsubscribeMessage?.();
      unsubscribeEdit?.();
      unsubscribeDelete?.();
      unsubscribeTranslation?.();
      unsubscribeUnread?.();
      unsubscribeTranscription?.();
      unsubscribeAudioTranslation?.();
      unsubscribeAttachmentStatus?.();
      unsubscribePreferences?.();
      unsubscribeJoined?.();
      unsubscribeLeft?.();
      unsubscribeParticipantRole?.();
      unsubscribeConversationNew?.();
      unsubscribeConversationDeleted?.();
      unsubscribeConversationUpdated?.();
      unsubscribeParticipantLeft?.();
      unsubscribeParticipantBanned?.();
      unsubscribeParticipantUnbanned?.();
      unsubscribeConversationClosed?.();
      unsubscribeCategoryChanged?.();
      unsubscribeMessageAttachmentUpdated?.();
      unsubscribePendingDelivered?.();
      unsubscribeLinkMessageNew?.();
      unsubscribeConversationJoinError?.();
      unsubscribeMessagePinned?.();
      unsubscribeMessageUnpinned?.();
      unsubscribeUserUpdated?.();
    };
  }, [conversationId, enabled, queryClient]);
}

/**
 * Hook to invalidate queries on reconnect.
 * Note: React Query's refetchOnReconnect: 'always' already handles most cases.
 * This hook provides additional invalidation for socket reconnection.
 */
export function useInvalidateOnReconnect() {
  const queryClient = useQueryClient();

  useEffect(() => {
    // Listen for online events as a proxy for reconnection
    const handleOnline = () => {
      // Invalidate all queries on reconnect to ensure fresh data
      queryClient.invalidateQueries({ queryKey: queryKeys.conversations.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.notifications.all });
    };

    window.addEventListener('online', handleOnline);

    return () => {
      window.removeEventListener('online', handleOnline);
    };
  }, [queryClient]);
}
