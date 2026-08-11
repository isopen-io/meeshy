'use client';

import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/react-query/query-keys';
import { meeshySocketIOService } from '@/services/meeshy-socketio.service';
import { apiService } from '@/services/api.service';
import { useAuthStore } from '@/stores/auth-store';
import { useNotificationStore } from '@/stores/notification-store';
import { setConversationUnreadInCache } from '@/lib/conversations/unread-cache';
import {
  rebuildInfiniteConversationPages,
  type InfiniteConversationData,
} from '@/lib/conversations/infinite-cache';
import { extractPreviewTranslations } from '@/services/conversations/transformers.service';
import type { Message, Conversation } from '@/types';
import type { TranslationEvent } from '@meeshy/shared/types';
import type { SocketIOTranslation } from '@meeshy/shared/types/attachment-audio';
import type { AudioTranslationReadyEventData, TranscriptionReadyEventData } from '@meeshy/shared/types/socketio-events';
import type { OptimisticMessage } from '@/utils/optimistic-message';

function isOptimisticMessage(m: Message): m is OptimisticMessage {
  return '_tempId' in m;
}

function editedAtMs(value: Date | string | undefined | null): number | null {
  if (!value) return null;
  const ms = new Date(value).getTime();
  return Number.isNaN(ms) ? null : ms;
}

// A `message:edited` socket event carries no monotonic sequence — a delayed
// duplicate delivery or reordered frame can arrive after a newer edit was
// already applied. Comparing `editedAt` against the cached row's stops a
// stale edit from permanently clobbering the current content.
function isStaleEdit(cached: Message, incoming: Message): boolean {
  const cachedMs = editedAtMs(cached.editedAt);
  if (cachedMs === null) return false;
  const incomingMs = editedAtMs(incoming.editedAt);
  if (incomingMs === null) return false;
  return incomingMs < cachedMs;
}

type CachedMessage = Message & {
  translatedAudios?: Record<string, SocketIOTranslation>;
};

// Socket payloads carry timestamps as ISO strings, while everything the REST
// layer puts in the conversation cache went through
// `transformersService.transformConversationData`, which materialises them as
// `Date` — the shape `Conversation` declares. Writing the raw string back into
// a cached conversation left the cache holding both shapes for the same field.
function toDate(value: unknown): Date | null {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

const CONVERSATION_DATE_FIELDS = new Set([
  'lastMessageAt',
  'createdAt',
  'updatedAt',
  'encryptionEnabledAt',
]);

/**
 * Turns an untyped `conversation:updated` payload into a patch that matches
 * `Conversation`: date fields are materialised, and an unparseable date is
 * dropped rather than overwriting a valid cached value with garbage.
 *
 * The final assertion is the trust boundary: the event declares an
 * `[key: string]: unknown` index signature (the gateway spreads whichever
 * fields changed), so no narrower type can be inferred from it.
 */
export function normalizeConversationPatch(raw: Record<string, unknown>): Partial<Conversation> {
  const patch: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (key === 'lastMessageTranslations') {
      // `null` est une VALEUR ici, pas une absence : le serveur périme
      // `Message.translations` dans la même écriture qu'une édition, et c'est ce
      // null reçu qui doit périmer la carte du cache. La clé reste donc
      // présente (le cache applique `{ ...conv, ...patch }` — une clé absente
      // laisserait la carte de l'ANCIEN texte en place, et `formatLastMessage`
      // la préfère à `lastMessagePreview`). Même forme que le chemin REST.
      patch[key] = extractPreviewTranslations(value);
      continue;
    }
    if (key === 'lastMessageOriginalLanguage') {
      patch[key] = typeof value === 'string' ? value : undefined;
      continue;
    }
    if (!CONVERSATION_DATE_FIELDS.has(key)) {
      patch[key] = value;
      continue;
    }
    const asDate = toDate(value);
    if (asDate) patch[key] = asDate;
  }
  return patch as Partial<Conversation>;
}

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
      return rebuildInfiniteConversationPages(old, updated);
    }
  );
}

// After a message is deleted, advance the conversation-list preview to the
// newest remaining message — but only for conversations whose `lastMessage`
// WAS the deleted message. Mirrors the lastMessage-update pattern used by the
// edited-message handler, across both the flat and infinite conversation
// caches.
function advanceConversationPreviewOnDelete(
  queryClient: ReturnType<typeof useQueryClient>,
  conversationId: string,
  deletedMessageId: string,
  replacement: Message
): void {
  const replace = (conv: Conversation): Conversation =>
    conv.id === conversationId && conv.lastMessage?.id === deletedMessageId
      ? { ...conv, lastMessage: replacement, lastMessageAt: replacement.createdAt }
      : conv;

  queryClient.setQueriesData<Conversation[]>(
    { queryKey: queryKeys.conversations.lists() },
    (old) => (old ? old.map(replace) : old)
  );
  updateInfiniteConversationCache(queryClient, (convs) => convs.map(replace));
}

interface UseSocketCacheSyncOptions {
  conversationId?: string | null;
  enabled?: boolean;
}

type InfiniteMessagesData = {
  pages: { messages: Message[]; hasMore: boolean; total: number }[];
  pageParams: number[];
};

/**
 * Every cached message list that belongs to `conversationId`.
 *
 * A conversation can be opened by its ObjectId (`/conversations/:id`) OR by its
 * identifier — the home page mounts the global conversation as `"meeshy"` — and
 * the cache key mirrors whichever the screen used. Socket payloads always carry
 * the resolved ObjectId, so keying the write on that alone silently skipped the
 * slug-keyed entry and left the global conversation frozen until a reload.
 * Alias entries are recognised by the `conversationId` their cached messages
 * carry, which is the resolved ObjectId in every case.
 *
 * Every handler that writes into a message list routes through this helper. A
 * direct `setQueryData(queryKeys.messages.infinite(id), …)` reaches the
 * ObjectId-keyed entry only, and with `staleTime: Infinity` the alias copy is
 * never re-read — the home-page bubble stays frozen on pre-event state until a
 * manual refresh. Writing to the exact key it already returns is unchanged
 * behaviour, so the helper is a strict superset, never a narrowing.
 */
/**
 * `attachment:status-updated` action → the attachment field it stamps. An action
 * outside this set is rejected before the name is used as a computed key, which
 * would otherwise write a literal `"undefined"` property onto the attachment.
 */
const CONSUMPTION_FIELD_BY_ACTION: Record<string, string> = {
  listened: 'listenedAt',
  watched: 'watchedAt',
  viewed: 'viewedAt',
  downloaded: 'downloadedAt',
};

function messageCacheKeysFor(
  queryClient: ReturnType<typeof useQueryClient>,
  conversationId: string
): unknown[][] {
  const keys: unknown[][] = [];
  for (const query of queryClient.getQueryCache().findAll({ queryKey: queryKeys.messages.lists() })) {
    const key = query.queryKey as unknown[];
    if (key[2] === conversationId) {
      keys.push(key);
      continue;
    }
    const data = query.state.data as InfiniteMessagesData | undefined;
    const belongsToConversation = data?.pages?.some((page) =>
      page.messages?.some((m) => m.conversationId === conversationId)
    );
    if (belongsToConversation) keys.push(key);
  }
  return keys;
}

export function useSocketCacheSync(options: UseSocketCacheSyncOptions = {}) {
  const { conversationId, enabled = true } = options;
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!enabled) return;

    // Handler for new messages
    const handleNewMessage = (message: Message) => {
      const targetConversationId = message.conversationId;

      // Tracks whether the message actually landed in a cache entry. When the
      // conversation has no cached page yet (initial fetch still in flight, or
      // conversation never opened this session) the updater below bails out and
      // the message would be lost for good: the socket layer already marked its
      // id as "seen" for 5 minutes, so no re-delivery repairs the gap, and with
      // `staleTime: Infinity` nothing re-reads the server either.
      let landedInCache = false;

      // Update every cached message list of this conversation (ObjectId-keyed
      // and identifier-keyed alike).
      const updateMessagesCache = (
        old: InfiniteMessagesData | undefined
      ): InfiniteMessagesData | undefined => {
          if (!old) return old;
          landedInCache = true;

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

              // Fallback : dédup par timestamp pour tout optimiste NON encore
              // réconcilié (pas de `_serverMessageId`). Couvre le broadcast
              // arrivé AVANT le ACK (status 'sending') ET le cas où le ACK a
              // expiré (status 'failed', voir messaging.service `timedOut`) alors
              // que le serveur a bien persisté puis diffusé le message — typique
              // du replay de la delivery-queue au reconnect, bien après les 10 s.
              // Un broadcast qui matche (même auteur, < 5 s) prouve que l'envoi a
              // réussi : la bulle en échec est réconciliée, jamais dupliquée.
              if (isOwnMessage && isOptimisticMessage(m)) {
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
      };

      for (const key of messageCacheKeysFor(queryClient, targetConversationId)) {
        queryClient.setQueryData(key, updateMessagesCache);
      }

      // No cache entry to write into: mark the query stale so the in-flight
      // fetch is re-issued (and any later mount re-reads) from the server —
      // the only source able to close the gap this message would leave.
      if (!landedInCache) {
        queryClient.invalidateQueries({
          queryKey: queryKeys.messages.infinite(targetConversationId),
        });
      }

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

      const applyEdit = (old: InfiniteMessagesData | undefined): InfiniteMessagesData | undefined => {
        if (!old) return old;
        return {
          ...old,
          pages: old.pages.map((page) => ({
            ...page,
            messages: page.messages.map((m) =>
              m.id === message.id && !isStaleEdit(m, message) ? { ...m, ...message } : m
            ),
          })),
        };
      };

      for (const key of messageCacheKeysFor(queryClient, targetConversationId)) {
        queryClient.setQueryData(key, applyEdit);
      }

      // Update lastMessage in ALL conversation list variants if this edited message is the last one
      queryClient.setQueriesData<Conversation[]>(
        { queryKey: queryKeys.conversations.lists() },
        (old) => {
          if (!old) return old;
          return old.map((conv) => {
            if (
              conv.id === targetConversationId &&
              conv.lastMessage?.id === message.id &&
              !isStaleEdit(conv.lastMessage, message)
            ) {
              return { ...conv, lastMessage: message };
            }
            return conv;
          });
        }
      );
      updateInfiniteConversationCache(queryClient, (convs) =>
        convs.map((conv) =>
          conv.id === targetConversationId &&
          conv.lastMessage?.id === message.id &&
          !isStaleEdit(conv.lastMessage, message)
            ? { ...conv, lastMessage: message }
            : conv
        )
      );
    };

    // Handler for deleted messages.
    //
    // `message:deleted` reaches this hook as a BARE messageId: the gateway sends
    // `{ messageId, conversationId }` but the transport layer
    // (`messaging.service`) forwards only `data.messageId`. The removal used to
    // be scoped to the hook's ACTIVE conversation, which silently ignored a
    // delete in any other one — the socket is joined to every conversation room
    // the user belongs to, and with `staleTime: Infinity` the deleted bubble
    // stayed visible there until an unrelated refetch. Locating the message by
    // id across every cached message list is a strict superset of the active
    // conversation, and it also reaches an identifier-keyed alias entry (the
    // home page mounts the global conversation as "meeshy" while socket
    // payloads carry the resolved ObjectId) — where the previous single-key
    // write, and the `break` in the fallback scan, could only ever clean one of
    // the two copies.
    const handleMessageDeleted = (messageId: string) => {
      // Track the newest remaining message so the conversation-list preview can
      // advance when the deleted message WAS that preview. Without it the list
      // keeps showing the deleted message's content until a full refetch.
      const removeFromCache = (cacheKey: unknown[], owningConversationId: string | undefined) => {
        let newestRemaining: Message | null = null;
        queryClient.setQueryData(
          cacheKey,
          (old: InfiniteMessagesData | undefined) => {
            if (!old) return old;
            const next = {
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
            for (const page of next.pages) {
              for (const m of page.messages) {
                if (
                  !newestRemaining ||
                  new Date(m.createdAt).getTime() > new Date(newestRemaining.createdAt).getTime()
                ) {
                  newestRemaining = m;
                }
              }
            }
            return next;
          }
        );

        // Only advance the preview when a replacement is present in cache.
        // If no message remains cached we cannot tell an empty conversation
        // from one whose older messages simply aren't loaded — leaving the
        // (stale) preview is strictly safer than blanking a non-empty chat.
        if (owningConversationId && newestRemaining) {
          advanceConversationPreviewOnDelete(queryClient, owningConversationId, messageId, newestRemaining);
        }
      };

      for (const query of queryClient.getQueryCache().findAll({ queryKey: queryKeys.messages.lists() })) {
        const data = query.state.data as InfiniteMessagesData | undefined;
        const deleted = data?.pages
          ?.flatMap((page) => page.messages ?? [])
          .find((m) => m.id === messageId);
        if (!deleted) continue;
        // The conversation the preview belongs to comes from the message ITSELF
        // (always the resolved ObjectId, which is what the conversation list is
        // keyed on), never from the query key — that can be an identifier alias
        // no conversation row matches.
        removeFromCache(query.queryKey as unknown[], deleted.conversationId ?? (query.queryKey[2] as string | undefined));
      }
    };

    // Handler for message translations — merges as Translation[] array (not Record).
    //
    // `TranslationEvent` carries only `messageId` (no conversationId), and the
    // socket is joined to EVERY conversation room the user belongs to — so a
    // translation can arrive for a message that lives in a conversation other
    // than the one currently open (e.g. a message received while viewing the
    // list or another chat, whose async translation completes moments later).
    // Scoping the write to the hook's active `conversationId` silently dropped
    // those, leaving the message stranded in its original language until a
    // window refocus / manual refetch (`staleTime: Infinity` never re-reads it)
    // — a direct Prisme Linguistique violation. Route the merge by `messageId`
    // across every cached message list, mirroring `handleMessageDeleted`'s scan.
    const handleTranslation = (data: TranslationEvent) => {
      const applyMerge = (
        old: InfiniteMessagesData | undefined
      ): InfiniteMessagesData | undefined => {
        if (!old) return old;
        let changed = false;
        const pages = old.pages.map((page) => {
          let pageChanged = false;
          const messages = page.messages.map((m) => {
            if (m.id !== data.messageId) return m;
            pageChanged = true;

            // Merge translations as array, dedup by targetLanguage
            const existingTranslations = Array.isArray(m.translations) ? [...m.translations] : [];
            for (const t of data.translations) {
              const idx = existingTranslations.findIndex((et) => et.targetLanguage === t.targetLanguage);
              if (idx >= 0) existingTranslations[idx] = t;
              else existingTranslations.push(t);
            }

            return { ...m, translations: existingTranslations };
          });
          if (pageChanged) { changed = true; return { ...page, messages }; }
          return page;
        });
        return changed ? { ...old, pages } : old;
      };

      for (const query of queryClient.getQueryCache().findAll({ queryKey: queryKeys.messages.lists() })) {
        const cached = query.state.data as InfiniteMessagesData | undefined;
        if (!cached?.pages?.some((page) => page.messages?.some((m) => m.id === data.messageId))) continue;
        queryClient.setQueryData(query.queryKey, applyMerge);
      }
    };

    // Handler for unread count updates — applies to ALL conversation list variants (filtered, unfiltered)
    const handleUnreadUpdated = (data: { conversationId: string; unreadCount: number }) => {
      // Garde de conversation OUVERTE (miroir du gate iOS
      // `ConversationSyncEngine.handleUnreadUpdated`) : le gateway émet le
      // compteur à TOUS les destinataires, y compris celui qui regarde la
      // conversation. Sans clamp, le badge s'allume sur la conversation en
      // cours de lecture entre l'arrivée du message et l'aller-retour
      // mark-as-read (et indéfiniment si l'utilisateur est scrollé dans
      // l'historique). Un message postérieur à la fermeture ré-allumera le
      // badge normalement : la garde ne s'applique qu'à la conversation active.
      const activeConversationId = useNotificationStore.getState().activeConversationId;
      const effectiveUnread =
        data.conversationId === activeConversationId ? 0 : data.unreadCount;

      setConversationUnreadInCache(queryClient, data.conversationId, effectiveUnread);
    };

    const handleParticipantRoleUpdated = (data: { conversationId: string; userId: string; newRole: string }) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.conversations.participants(data.conversationId),
      });
    };

    // W6: Handler for transcription results (`audio:transcription-ready`, stage 1
    // of the audio pipeline) — writes the transcription onto the attachment it
    // belongs to.
    //
    // Routed by the event's OWN `conversationId`, like `handleAudioTranslation`
    // and `handleTranslation`: the socket is joined to every conversation room
    // the user belongs to, so a voice note transcribed while they read another
    // chat — or read none at all (`ConversationLayout` passes
    // `effectiveSelectedId`, which is null on the conversation-list view) —
    // belongs to a cache entry that is not the hook's active conversation.
    // Writing to the active key dropped it silently, and `staleTime: Infinity`
    // never re-reads it: the bubble stayed untranscribed until a manual
    // refresh. Same Prisme Linguistique gap the two sibling handlers close, on
    // the one pipeline stage that had been left behind.
    //
    // `messageCacheKeysFor` (rather than a single `messages.infinite(id)` write)
    // also reaches an identifier-keyed alias entry — the home page mounts the
    // global conversation as "meeshy" while socket payloads carry the resolved
    // ObjectId.
    //
    // The attachment is picked by `data.attachmentId`, not by "first audio
    // attachment": a message can carry several voice notes, each transcribed by
    // its own event, and first-match stamped every one of them onto the first
    // note while the others stayed permanently untranscribed. The mimeType scan
    // remains only as the fallback for a payload that carries no attachmentId —
    // a named-but-unknown attachment is left alone, since mis-attributing a
    // transcription is worse than not showing it yet.
    const handleTranscription = (data: TranscriptionReadyEventData) => {
      const targetConversationId = data.conversationId ?? conversationId;
      if (!targetConversationId) return;

      const language = data.transcription?.language;

      const applyTranscription = (
        old: InfiniteMessagesData | undefined
      ): InfiniteMessagesData | undefined => {
        if (!old) return old;
        return {
          ...old,
          pages: old.pages.map((page) => ({
            ...page,
            messages: page.messages.map((m) => {
              if (m.id !== data.messageId) return m;
              const attachments = Array.isArray(m.attachments) ? [...m.attachments] : [];
              const targetIdx = data.attachmentId
                ? attachments.findIndex((a) => a.id === data.attachmentId)
                : attachments.findIndex((a) => a.mimeType?.startsWith('audio/'));
              if (targetIdx >= 0) {
                attachments[targetIdx] = {
                  ...attachments[targetIdx],
                  transcription: data.transcription,
                  transcriptionLanguage: language,
                };
              }
              return { ...m, attachments, transcription: data.transcription, transcriptionLanguage: language };
            }),
          })),
        };
      };

      for (const key of messageCacheKeysFor(queryClient, targetConversationId)) {
        queryClient.setQueryData(key, applyTranscription);
      }
    };

    // W6: Handler for audio translation ready — updates attachment with translated audio URL.
    //
    // The event carries its own `conversationId`, and the socket receives audio
    // translations for every joined conversation room — so route by
    // `data.conversationId` rather than the hook's active conversation, or an
    // audio translation completing for a background conversation is dropped
    // (same Prisme gap as `handleTranslation`).
    const handleAudioTranslation = (data: AudioTranslationReadyEventData) => {
      const targetConversationId = data.conversationId ?? conversationId;
      if (!targetConversationId) return;

      const targetLang = data.translatedAudio.targetLanguage;
      const applyAudioTranslation = (
        old: InfiniteMessagesData | undefined
      ): InfiniteMessagesData | undefined => {
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
      };

      for (const key of messageCacheKeysFor(queryClient, targetConversationId)) {
        queryClient.setQueryData(key, applyAudioTranslation);
      }
    };

    // `conversation:joined` n'est PAS une adhésion : le gateway l'émet aussi —
    // même nom, même payload — comme l'ack self-only d'un socket qui REJOINT LA
    // ROOM (`ConversationHandler`), c'est-à-dire à CHAQUE ouverture de fil.
    // L'incrémentation qui vivait ici gonflait donc l'effectif de la ligne de
    // liste d'une unité par ouverture, indéfiniment. L'adhésion réelle passe
    // par `conversation:participant-joined` ci-dessous ; il ne reste ici que
    // l'invalidation, légitime dans les deux lectures.
    const handleConversationJoined = (data: { conversationId: string; userId: string }) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.conversations.participants(data.conversationId),
      });
    };

    // Réécrit l'effectif d'UNE conversation dans les deux formes de cache de
    // liste, et invalide le roster paginé. Quatre handlers d'appartenance en
    // faisaient chacun une copie ; seul `resolve` les distingue.
    //
    // `resolve` reçoit l'effectif en cache et rend le nouveau. Les événements
    // du gateway portent désormais un `memberCount` ABSOLU : c'est lui qu'il
    // faut POSER. Le delta n'est plus qu'un repli pour un serveur antérieur au
    // contrat, et il ne converge pas — un événement manqué (hors ligne, trou de
    // reconnexion) laisse une dérive définitive dans un cache dont le
    // `staleTime: Infinity` interdit la relecture spontanée.
    const applyMemberCount = (conversationId: string, resolve: (current: number) => number) => {
      const updater = (convs: Conversation[]) =>
        convs.map((conv) =>
          conv.id === conversationId
            ? { ...conv, memberCount: resolve(conv.memberCount ?? 0) }
            : conv
        );
      queryClient.setQueriesData<Conversation[]>(
        { queryKey: queryKeys.conversations.lists() },
        (old) => old ? updater(old) : old
      );
      updateInfiniteConversationCache(queryClient, updater);
      queryClient.invalidateQueries({
        queryKey: queryKeys.conversations.participants(conversationId),
      });
    };

    // Handler for participant joined — the symmetric counterpart of
    // `handleConversationParticipantLeft`, and the only unambiguous carrier of
    // an actual membership gain. The gateway leaves the new member OUT of this
    // fan-out: their own list gets the conversation from `conversation:new`,
    // whose member count already includes them.
    const handleConversationParticipantJoined = (data: { conversationId: string; userId: string; displayName: string; joinedAt: string; memberCount?: number }) => {
      applyMemberCount(data.conversationId, (current) => data.memberCount ?? current + 1);
    };

    // Le pendant EXACT de `conversation:joined` ci-dessus, et le même piège :
    // `conversation:left` n'a qu'un seul émetteur, `socket.emit` après
    // `socket.leave(room)` (`ConversationHandler.handleConversationLeave`). Il
    // dit « ce socket a quitté la ROOM » — ce que produit la fermeture d'un
    // fil — jamais « quelqu'un a quitté la conversation ». La décrémentation
    // qui vivait ici retirait donc un membre à chaque fermeture de fil.
    //
    // Les deux erreurs se compensaient EN PARTIE, ce qui les cachait, mais
    // jamais exactement : une reconnexion socket rejoint la room sans avoir
    // émis de `leave`, et l'appli fermée ne l'émet pas non plus, tandis que la
    // soustraction était bornée à 0 et l'addition ne l'était pas. Le départ
    // réel passe par `conversation:participant-left`.
    const handleConversationLeft = (data: { conversationId: string; userId: string }) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.conversations.participants(data.conversationId),
      });
    };

    // Handler for participant-left (room broadcast) — another member was removed/left
    const handleConversationParticipantLeft = (data: { conversationId: string; userId: string; displayName: string; leftAt: string; memberCount?: number }) => {
      applyMemberCount(data.conversationId, (current) => data.memberCount ?? Math.max(0, current - 1));
    };

    // Handler for participant-banned — member was banned from the conversation.
    // `membershipEnded: false` means the target had ALREADY left: banning an
    // ex-member is what keeps them from walking back in through a share link,
    // but it removes no membership, so the count must not move. Absent on
    // servers older than that contract, where a ban always removed one.
    const handleConversationParticipantBanned = (data: { conversationId: string; userId: string; bannedBy: { id: string }; bannedAt: string; membershipEnded?: boolean; memberCount?: number }) => {
      // L'effectif absolu tranche `membershipEnded` de lui-même — bannir un
      // ex-membre ne retire personne, donc le compte est simplement inchangé.
      // Le court-circuit ne subsiste que pour les serveurs qui ne l'envoient pas.
      if (typeof data.memberCount !== 'number' && data.membershipEnded === false) {
        queryClient.invalidateQueries({
          queryKey: queryKeys.conversations.participants(data.conversationId),
        });
        return;
      }
      applyMemberCount(data.conversationId, (current) => data.memberCount ?? Math.max(0, current - 1));
    };

    // Handler for participant-unbanned — member was unbanned and is an active
    // member again. Pose l'effectif du serveur, et à défaut incrémente comme
    // l'exact inverse du décrément de bannissement : sans cela, chaque
    // aller-retour ban/unban laissait le cache un cran sous la réalité, et la
    // dérive tenait jusqu'à un refetch complet sans rapport (`staleTime:
    // Infinity` ne relit jamais de lui-même).
    //
    // `membershipRestored: false` means the unban lifted the ban WITHOUT
    // re-admitting anyone — the person had left on their own before being
    // banned, so there is no ban-time decrement to undo here either.
    const handleConversationParticipantUnbanned = (data: { conversationId: string; userId: string; membershipRestored?: boolean; memberCount?: number }) => {
      if (typeof data.memberCount !== 'number' && data.membershipRestored === false) {
        queryClient.invalidateQueries({
          queryKey: queryKeys.conversations.participants(data.conversationId),
        });
        return;
      }
      applyMemberCount(data.conversationId, (current) => data.memberCount ?? current + 1);
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
      const applyAttachment = (
        old: InfiniteMessagesData | undefined
      ): InfiniteMessagesData | undefined => {
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
      };

      for (const key of messageCacheKeysFor(queryClient, attachConvId)) {
        queryClient.setQueryData(key, applyAttachment);
      }
    };

    // Handler for message:pinned — update message in cache with pin metadata
    const handleMessagePinned = (data: { messageId: string; conversationId: string; pinnedBy: string; pinnedAt: string }) => {
      const { conversationId: pinnedConvId, messageId: pinnedMsgId, pinnedBy, pinnedAt } = data;
      if (!pinnedConvId || !pinnedMsgId) return;
      const applyPin = (
        old: InfiniteMessagesData | undefined
      ): InfiniteMessagesData | undefined => {
        if (!old) return old;
        return {
          ...old,
          pages: old.pages.map((page) => ({
            ...page,
            messages: page.messages.map((m) =>
              m.id === pinnedMsgId
                ? ({ ...m, pinnedBy, pinnedAt } as Message & { pinnedBy: string; pinnedAt: string })
                : m
            ),
          })),
        };
      };

      for (const key of messageCacheKeysFor(queryClient, pinnedConvId)) {
        queryClient.setQueryData(key, applyPin);
      }
    };

    // Handler for message:unpinned — clear pin metadata from message in cache
    const handleMessageUnpinned = (data: { messageId: string; conversationId: string }) => {
      const { conversationId: unpinnedConvId, messageId: unpinnedMsgId } = data;
      if (!unpinnedConvId || !unpinnedMsgId) return;
      const clearPin = (
        old: InfiniteMessagesData | undefined
      ): InfiniteMessagesData | undefined => {
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
      };

      for (const key of messageCacheKeysFor(queryClient, unpinnedConvId)) {
        queryClient.setQueryData(key, clearPin);
      }
    };

    // Handler for link:message:new — a link preview message arrived; append to messages + bump conversation
    const handleLinkMessageNew = (data: { message: Record<string, unknown> }) => {
      const linkMsg = data.message;
      const linkConvId = linkMsg.conversationId as string | undefined;
      if (!linkConvId) return;
      const linkMsgId = linkMsg.id as string | undefined;

      // Même repli que `handleNewMessage` : sans entrée de cache (fetch initial
      // en vol, conversation jamais ouverte de la session), l'updater sort sur
      // `if (!old) return old` et le message est perdu pour de bon — `staleTime:
      // Infinity` ne relit jamais, et le serveur ne rediffuse pas.
      let landedInCache = false;

      const prependLinkMessage = (
        old: InfiniteMessagesData | undefined
      ): InfiniteMessagesData | undefined => {
        if (!old) return old;
        landedInCache = true;
        if (linkMsgId && old.pages.some((p) => p.messages.some((m) => m.id === linkMsgId))) return old;
        return {
          ...old,
          pages: old.pages.map((page, i) =>
            i === 0 ? { ...page, messages: [linkMsg as unknown as Message, ...page.messages] } : page
          ),
        };
      };

      for (const key of messageCacheKeysFor(queryClient, linkConvId)) {
        queryClient.setQueryData(key, prependLinkMessage);
      }

      if (!landedInCache) {
        queryClient.invalidateQueries({
          queryKey: queryKeys.messages.infinite(linkConvId),
        });
      }

      const linkLastMessage = linkMsg as unknown as Message;
      const linkLastMessageAt = toDate(linkMsg.createdAt) ?? new Date();

      queryClient.setQueriesData<Conversation[]>(
        { queryKey: queryKeys.conversations.lists() },
        (old) => {
          if (!old) return old;
          const idx = old.findIndex((c) => c.id === linkConvId);
          if (idx === -1) return old;
          const updated: Conversation = { ...old[idx], lastMessage: linkLastMessage, lastMessageAt: linkLastMessageAt };
          return [updated, ...old.filter((_, i) => i !== idx)];
        }
      );

      updateInfiniteConversationCache(queryClient, (convs) => {
        const idx = convs.findIndex((c) => c.id === linkConvId);
        if (idx === -1) return convs;
        const updated: Conversation = { ...convs[idx], lastMessage: linkLastMessage, lastMessageAt: linkLastMessageAt };
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

      const field = CONSUMPTION_FIELD_BY_ACTION[data.action];
      if (!field) return;

      // Stamped once, outside the updater: the same event now writes to every
      // cache entry of the conversation, and a per-entry `new Date()` would give
      // the same consumption two different timestamps depending on which key the
      // screen happens to read.
      const consumedAt = new Date().toISOString();

      const applyConsumption = (
        old: InfiniteMessagesData | undefined
      ): InfiniteMessagesData | undefined => {
        if (!old) return old;
        return {
          ...old,
          pages: old.pages.map((page) => ({
            ...page,
            messages: page.messages.map((m) => {
              if (m.id !== data.messageId) return m;
              const attachments = Array.isArray(m.attachments)
                ? m.attachments.map((a: any) =>
                    a.id === data.attachmentId ? { ...a, [field]: consumedAt } : a
                  )
                : m.attachments;
              return { ...m, attachments };
            }),
          })),
        };
      };

      for (const key of messageCacheKeysFor(queryClient, targetConversationId)) {
        queryClient.setQueryData(key, applyConsumption);
      }
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
      const patch = normalizeConversationPatch(rest);
      updateInfiniteConversationCache(queryClient, (convs) =>
        convs.map((c) => c.id === updatedId ? { ...c, ...patch } : c)
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
      // (has `conversationId`) vs community-scoped (has `communityId`). Web cache
      // invalidation here handles the user-level and community-scoped variants;
      // the conversation-scoped variant is consumed by the new ConversationStore
      // (iOS first; web wiring lands in a later phase).
      if ('category' in data) {
        queryClient.invalidateQueries({
          queryKey: queryKeys.preferences.category(data.category),
        });
        return;
      }
      if ('communityId' in data) {
        queryClient.invalidateQueries({
          queryKey: queryKeys.communities.preferences.detail(data.communityId),
        });
        queryClient.invalidateQueries({
          queryKey: queryKeys.communities.preferences.list(),
        });
      }
    });
    const unsubscribeJoined = meeshySocketIOService.onConversationJoined(handleConversationJoined);
    const unsubscribeLeft = meeshySocketIOService.onConversationLeft(handleConversationLeft);
    const unsubscribeParticipantRole = meeshySocketIOService.onParticipantRoleUpdated(handleParticipantRoleUpdated);
    const unsubscribeConversationNew = meeshySocketIOService.onConversationNew(handleConversationNew);
    const unsubscribeConversationDeleted = meeshySocketIOService.onConversationDeleted(handleConversationDeleted);
    const unsubscribeConversationUpdated = meeshySocketIOService.onConversationUpdated(handleConversationUpdated);
    const unsubscribeParticipantJoined = meeshySocketIOService.onConversationParticipantJoined(handleConversationParticipantJoined);
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
      unsubscribeParticipantJoined?.();
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
