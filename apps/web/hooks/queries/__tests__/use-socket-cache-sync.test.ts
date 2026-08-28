/**
 * Tests for useSocketCacheSync — B1 dedup changes
 *
 * Verifies:
 * - ID-only dedup in handleNewMessage (no content-based matching)
 * - No false-positive dedup when content matches but ID differs
 * - Existing server-ID dedup still works
 * - Conversations list is updated on new message
 */

import { renderHook, act, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { queryKeys } from '@/lib/react-query/query-keys';
import type { Message, Conversation } from '@/types';
import type { ConversationBridge } from '@meeshy/shared/types/conversation-bridge';

// Capture the new-message listener registered by the hook
let capturedMessageListener: ((message: Message) => void) | null = null;
// Capture the delete listener registered by the hook
let capturedDeleteListener: ((messageId: string) => void) | null = null;
// Capture the edit listener — un des cinq écrivains locaux de la ligne de liste
let capturedEditListener: ((message: Message) => void) | null = null;
// Capture the translation + audio-translation listeners registered by the hook
let capturedTranslationListener: ((data: any) => void) | null = null;
let capturedAudioTranslationListener: ((data: any) => void) | null = null;
// Capture the transcription listener registered by the hook
let capturedTranscriptionListener: ((data: any) => void) | null = null;
// Capture the listeners whose writes used to target a single ObjectId-keyed entry
let capturedAttachmentUpdatedListener: ((data: any) => void) | null = null;
let capturedAttachmentStatusListener: ((data: any) => void) | null = null;
let capturedMessagePinnedListener: ((data: any) => void) | null = null;
let capturedMessageUnpinnedListener: ((data: any) => void) | null = null;
let capturedLinkMessageNewListener: ((data: any) => void) | null = null;
// Capture the preferences listener — `user:preferences-updated` is a three-scope union
let capturedPreferencesListener: ((data: any) => void) | null = null;
let capturedPreferencesReorderedListener: ((data: any) => void) | null = null;
let capturedCommunityPreferencesReorderedListener: ((data: any) => void) | null = null;
// Capture the unread-updated listener — REV-5/B1, maillon 3 (le pont ✦ voyage sur cet événement)
let capturedUnreadUpdatedListener: ((data: any) => void) | null = null;

jest.mock('@/services/meeshy-socketio.service', () => ({
  meeshySocketIOService: {
    onNewMessage: jest.fn((listener: (msg: Message) => void) => {
      capturedMessageListener = listener;
      return () => { capturedMessageListener = null; };
    }),
    onMessageEdited: jest.fn((listener: (message: Message) => void) => {
      capturedEditListener = listener;
      return () => { capturedEditListener = null; };
    }),
    onMessageDeleted: jest.fn((listener: (messageId: string) => void) => {
      capturedDeleteListener = listener;
      return () => { capturedDeleteListener = null; };
    }),
    onMessageRestoredForMe: jest.fn(() => () => {}),
    onTranslation: jest.fn((listener: (data: any) => void) => {
      capturedTranslationListener = listener;
      return () => { capturedTranslationListener = null; };
    }),
    onUnreadUpdated: jest.fn((listener: (data: any) => void) => {
      capturedUnreadUpdatedListener = listener;
      return () => { capturedUnreadUpdatedListener = null; };
    }),
    onTranscription: jest.fn((listener: (data: any) => void) => {
      capturedTranscriptionListener = listener;
      return () => { capturedTranscriptionListener = null; };
    }),
    onAudioTranslation: jest.fn((listener: (data: any) => void) => {
      capturedAudioTranslationListener = listener;
      return () => { capturedAudioTranslationListener = null; };
    }),
    onAttachmentStatusUpdated: jest.fn((listener: (data: any) => void) => {
      capturedAttachmentStatusListener = listener;
      return () => { capturedAttachmentStatusListener = null; };
    }),
    onParticipantRoleUpdated: jest.fn(() => () => {}),
    onPreferencesUpdated: jest.fn((listener: (data: any) => void) => {
      capturedPreferencesListener = listener;
      return () => { capturedPreferencesListener = null; };
    }),
    onPreferencesReordered: jest.fn((listener: (data: any) => void) => {
      capturedPreferencesReorderedListener = listener;
      return () => { capturedPreferencesReorderedListener = null; };
    }),
    onCommunityPreferencesReordered: jest.fn((listener: (data: any) => void) => {
      capturedCommunityPreferencesReorderedListener = listener;
      return () => { capturedCommunityPreferencesReorderedListener = null; };
    }),
    onConversationJoined: jest.fn(() => () => {}),
    onConversationLeft: jest.fn(() => () => {}),
    onConversationNew: jest.fn(() => () => {}),
    onConversationDeleted: jest.fn(() => () => {}),
    onConversationUpdated: jest.fn(() => () => {}),
    onConversationParticipantJoined: jest.fn(() => () => {}),
    onConversationParticipantLeft: jest.fn(() => () => {}),
    onConversationParticipantBanned: jest.fn(() => () => {}),
    onConversationParticipantUnbanned: jest.fn(() => () => {}),
    onConversationClosed: jest.fn(() => () => {}),
    onCategoryChanged: jest.fn(() => () => {}),
    onMessageAttachmentUpdated: jest.fn((listener: (data: any) => void) => {
      capturedAttachmentUpdatedListener = listener;
      return () => { capturedAttachmentUpdatedListener = null; };
    }),
    onPendingMessagesDelivered: jest.fn(() => () => {}),
    onLinkMessageNew: jest.fn((listener: (data: any) => void) => {
      capturedLinkMessageNewListener = listener;
      return () => { capturedLinkMessageNewListener = null; };
    }),
    onConversationJoinError: jest.fn(() => () => {}),
    onMessagePinned: jest.fn((listener: (data: any) => void) => {
      capturedMessagePinnedListener = listener;
      return () => { capturedMessagePinnedListener = null; };
    }),
    onMessageUnpinned: jest.fn((listener: (data: any) => void) => {
      capturedMessageUnpinnedListener = listener;
      return () => { capturedMessageUnpinnedListener = null; };
    }),
    onUserUpdated: jest.fn(() => () => {}),
    onStatusChange: jest.fn(() => () => {}),
  },
}));

jest.mock('@/services/api.service', () => ({
  apiService: { post: jest.fn().mockResolvedValue(undefined) },
}));

jest.mock('@/stores/auth-store', () => ({
  useAuthStore: {
    getState: () => ({ user: { id: 'current-user' } }),
  },
}));

const applyRemotePreferencesMock = jest.fn();
const applyRemoteReorderMock = jest.fn();
const refreshCategoriesMock = jest.fn().mockResolvedValue(undefined);
jest.mock('@/stores/conversation-preferences-store', () => ({
  useConversationPreferencesStore: {
    getState: () => ({
      applyRemotePreferences: applyRemotePreferencesMock,
      applyRemoteReorder: applyRemoteReorderMock,
      refreshCategories: refreshCategoriesMock,
    }),
  },
}));

const refreshMirroredPreferenceCategoryMock = jest.fn();
jest.mock('@/lib/preferences/mirrored-preference-categories', () => ({
  refreshMirroredPreferenceCategory: (category: string) =>
    refreshMirroredPreferenceCategoryMock(category),
}));

jest.mock('@/utils/logger', () => ({
  logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

jest.mock('@meeshy/shared/utils/sender-identity', () => ({
  getSenderUserId: (sender: any) => sender?.userId ?? sender?.id ?? null,
}));

// D-4 / R5-6, point 3(c) — ce fichier teste le CÂBLAGE (le socket appelle-t-il
// le bon point d'entrée avec le bon état de drapeau ?), pas la logique
// d'application elle-même — celle-ci a sa propre suite dédiée
// (`lib/conversations/__tests__/reading-mode-broadcast.test.ts`).
const applyReadingModePreferenceBroadcastMock = jest.fn();
jest.mock('@/lib/conversations/reading-mode-broadcast', () => ({
  applyReadingModePreferenceBroadcast: (...args: any[]) =>
    applyReadingModePreferenceBroadcastMock(...args),
}));

let readingModesFlagActive = false;
jest.mock('@/hooks/lentille/use-reading-modes-flag', () => ({
  useReadingModesFlag: () => ({ active: readingModesFlagActive }),
}));

import { useSocketCacheSync, mergeConversationUpdate } from '../use-socket-cache-sync';
import { resolveLastMessagePreview } from '@meeshy/shared/utils/conversation-helpers';

function makeMessage(overrides: Partial<Message> & { id: string; conversationId: string }): Message {
  return {
    content: 'test message',
    senderId: 'user-1',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    messageType: 'text',
    originalLanguage: 'en',
    timestamp: new Date().toISOString(),
    sender: { id: 'user-1', displayName: 'Test', type: 'registered' },
    ...overrides,
  } as Message;
}

/**
 * La sidebar lit `conversations.infinite()` — c'est le SEUL cache de liste que
 * l'application observe. Ces témoins visaient auparavant la forme plate
 * (`conversations.list()`), qui n'a aucun lecteur : ils passaient au vert sans
 * rien prouver du chemin réel.
 */
function seedConversations(queryClient: QueryClient, conversations: Conversation[]): void {
  queryClient.setQueryData(queryKeys.conversations.infinite(), {
    pages: [
      {
        conversations,
        pagination: { limit: 20, offset: 0, total: conversations.length, hasMore: false },
      },
    ],
    pageParams: [0],
  });
}

function cachedConversations(queryClient: QueryClient): Conversation[] {
  const data = queryClient.getQueryData(queryKeys.conversations.infinite()) as
    | { pages: { conversations: Conversation[] }[] }
    | undefined;
  return data?.pages.flatMap((page) => page.conversations) ?? [];
}

function createTestHarness(conversationId: string) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  // Seed infinite messages cache
  queryClient.setQueryData(queryKeys.messages.infinite(conversationId), {
    pages: [{ messages: [] as Message[], hasMore: false, total: 0 }],
    pageParams: [1],
  });

  // Seed conversations list cache
  seedConversations(queryClient, [
    { id: conversationId, lastMessage: null, lastMessageAt: null, updatedAt: new Date().toISOString() } as any,
  ]);

  const wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);

  return { queryClient, wrapper };
}

describe('useSocketCacheSync — B1 ID-only dedup', () => {
  beforeEach(() => {
    capturedMessageListener = null;
    jest.clearAllMocks();
  });

  it('adds new message to cache when ID is unique', () => {
    const { queryClient, wrapper } = createTestHarness('conv-1');
    renderHook(() => useSocketCacheSync({ conversationId: 'conv-1', enabled: true }), { wrapper });

    expect(capturedMessageListener).not.toBeNull();

    const msg = makeMessage({ id: 'server-1', conversationId: 'conv-1' });
    act(() => { capturedMessageListener!(msg); });

    const cached = queryClient.getQueryData(queryKeys.messages.infinite('conv-1')) as any;
    expect(cached.pages[0].messages).toHaveLength(1);
    expect(cached.pages[0].messages[0].id).toBe('server-1');
  });

  it('deduplicates by server ID', () => {
    const { queryClient, wrapper } = createTestHarness('conv-1');

    // Pre-seed with a message
    queryClient.setQueryData(queryKeys.messages.infinite('conv-1'), {
      pages: [{ messages: [makeMessage({ id: 'server-1', conversationId: 'conv-1' })], hasMore: false, total: 1 }],
      pageParams: [1],
    });

    renderHook(() => useSocketCacheSync({ conversationId: 'conv-1', enabled: true }), { wrapper });

    // Try to add same message again
    act(() => { capturedMessageListener!(makeMessage({ id: 'server-1', conversationId: 'conv-1' })); });

    const cached = queryClient.getQueryData(queryKeys.messages.infinite('conv-1')) as any;
    expect(cached.pages[0].messages).toHaveLength(1);
  });

  it('replaces optimistic message with server message when content matches', () => {
    const { queryClient, wrapper } = createTestHarness('conv-1');

    // Seed with an optimistic message (has _tempId, _localStatus: 'sending')
    const optimistic = {
      ...makeMessage({ id: 'temp-1', conversationId: 'conv-1', content: 'Hello world', senderId: 'current-user' }),
      _tempId: 'temp-1',
      _localStatus: 'sending',
    };
    queryClient.setQueryData(queryKeys.messages.infinite('conv-1'), {
      pages: [{ messages: [optimistic], hasMore: false, total: 1 }],
      pageParams: [1],
    });

    renderHook(() => useSocketCacheSync({ conversationId: 'conv-1', enabled: true }), { wrapper });

    // Server message with same content from same user (message:new before ACK)
    const serverMsg = makeMessage({ id: 'server-1', conversationId: 'conv-1', content: 'Hello world', senderId: 'current-user' });
    act(() => { capturedMessageListener!(serverMsg); });

    const cached = queryClient.getQueryData(queryKeys.messages.infinite('conv-1')) as any;
    // Optimistic should be replaced by server message
    expect(cached.pages[0].messages).toHaveLength(1);
    expect(cached.pages[0].messages[0].id).toBe('server-1');
  });

  it('reconciles a timed-out (failed) optimistic message when the server broadcast arrives', () => {
    const { queryClient, wrapper } = createTestHarness('conv-1');

    // A send whose ACK timed out: markMessageFailed set _localStatus to 'failed'
    // and left _serverMessageId unset (messaging.service returns { timedOut } and
    // the message may still have been persisted + broadcast server-side).
    const optimistic = {
      ...makeMessage({ id: 'temp-1', conversationId: 'conv-1', content: 'Hello world', senderId: 'current-user' }),
      _tempId: 'temp-1',
      _localStatus: 'failed',
    };
    queryClient.setQueryData(queryKeys.messages.infinite('conv-1'), {
      pages: [{ messages: [optimistic], hasMore: false, total: 1 }],
      pageParams: [1],
    });

    renderHook(() => useSocketCacheSync({ conversationId: 'conv-1', enabled: true }), { wrapper });

    // The server DID persist + broadcast the message (e.g. reconnect delivery-queue
    // replay) well after the 10s ACK timeout already marked the bubble failed.
    const serverMsg = makeMessage({ id: 'server-1', conversationId: 'conv-1', content: 'Hello world', senderId: 'current-user' });
    act(() => { capturedMessageListener!(serverMsg); });

    const cached = queryClient.getQueryData(queryKeys.messages.infinite('conv-1')) as any;
    // The failed bubble is reconciled into the delivered message, not duplicated.
    expect(cached.pages[0].messages).toHaveLength(1);
    expect(cached.pages[0].messages[0].id).toBe('server-1');
  });

  it('does NOT replace stale optimistic messages older than 30s', () => {
    const { queryClient, wrapper } = createTestHarness('conv-1');

    // Seed with a stale optimistic message (created 60s ago)
    const staleDate = new Date(Date.now() - 60_000);
    const optimistic = {
      ...makeMessage({ id: 'temp-1', conversationId: 'conv-1', content: 'Hello world', senderId: 'current-user' }),
      _tempId: 'temp-1',
      _localStatus: 'sending',
      createdAt: staleDate.toISOString(),
    };
    queryClient.setQueryData(queryKeys.messages.infinite('conv-1'), {
      pages: [{ messages: [optimistic], hasMore: false, total: 1 }],
      pageParams: [1],
    });

    renderHook(() => useSocketCacheSync({ conversationId: 'conv-1', enabled: true }), { wrapper });

    // Server message with same content — should NOT replace stale optimistic
    const serverMsg = makeMessage({ id: 'server-1', conversationId: 'conv-1', content: 'Hello world', senderId: 'current-user' });
    act(() => { capturedMessageListener!(serverMsg); });

    const cached = queryClient.getQueryData(queryKeys.messages.infinite('conv-1')) as any;
    // Both messages should exist (no replacement of stale optimistic)
    expect(cached.pages[0].messages).toHaveLength(2);
  });

  it('moves conversation to top of list on new message', () => {
    const { queryClient, wrapper } = createTestHarness('conv-1');

    // Add a second conversation
    seedConversations(queryClient, [
      { id: 'conv-2', lastMessage: null, updatedAt: new Date().toISOString() } as any,
      { id: 'conv-1', lastMessage: null, updatedAt: new Date().toISOString() } as any,
    ]);

    renderHook(() => useSocketCacheSync({ conversationId: 'conv-1', enabled: true }), { wrapper });

    const msg = makeMessage({ id: 'server-1', conversationId: 'conv-1' });
    act(() => { capturedMessageListener!(msg); });

    const convs = cachedConversations(queryClient);
    expect(convs[0].id).toBe('conv-1');
    expect(convs[0].lastMessage).toBeDefined();
  });
});

describe('useSocketCacheSync — delete advances conversation preview', () => {
  beforeEach(() => {
    capturedMessageListener = null;
    capturedDeleteListener = null;
    jest.clearAllMocks();
  });

  function seedTwoMessages(queryClient: QueryClient) {
    const older = makeMessage({
      id: 'm-old',
      conversationId: 'conv-1',
      content: 'older',
      createdAt: new Date('2026-01-01T00:00:00Z'),
    });
    const newer = makeMessage({
      id: 'm-new',
      conversationId: 'conv-1',
      content: 'newer',
      createdAt: new Date('2026-01-01T00:01:00Z'),
    });
    // Infinite messages cache stores newest-first in page 0
    queryClient.setQueryData(queryKeys.messages.infinite('conv-1'), {
      pages: [{ messages: [newer, older], hasMore: false, total: 2 }],
      pageParams: [1],
    });
    seedConversations(queryClient, [
      { id: 'conv-1', lastMessage: newer, lastMessageAt: newer.createdAt, updatedAt: newer.createdAt } as any,
    ]);
    return { older, newer };
  }

  it('advances conversation lastMessage to the previous message when the latest is deleted', () => {
    const { queryClient, wrapper } = createTestHarness('conv-1');
    const { older } = seedTwoMessages(queryClient);

    renderHook(() => useSocketCacheSync({ conversationId: 'conv-1', enabled: true }), { wrapper });
    expect(capturedDeleteListener).not.toBeNull();

    act(() => { capturedDeleteListener!('m-new'); });

    const cached = queryClient.getQueryData(queryKeys.messages.infinite('conv-1')) as any;
    expect(cached.pages[0].messages.map((m: Message) => m.id)).toEqual(['m-old']);

    const convs = cachedConversations(queryClient);
    expect(convs[0].lastMessage?.id).toBe('m-old');
    expect(convs[0].lastMessageAt).toBe(older.createdAt);
  });

  it('removes a message deleted in a NON-active conversation', () => {
    // `message:deleted` reaches the hook as a bare messageId — the transport
    // layer drops the event's conversationId — but the socket is joined to
    // EVERY conversation room, so deletes arrive for background conversations.
    // Scoping the removal to the active conversation left them in place, and
    // `staleTime: Infinity` never re-reads them.
    const { queryClient, wrapper } = createTestHarness('conv-active');
    const bgMessage = makeMessage({ id: 'm-bg', conversationId: 'conv-other', content: 'to delete' });
    queryClient.setQueryData(queryKeys.messages.infinite('conv-other'), {
      pages: [{ messages: [bgMessage], hasMore: false, total: 1 }],
      pageParams: [1],
    });

    renderHook(() => useSocketCacheSync({ conversationId: 'conv-active', enabled: true }), { wrapper });

    act(() => { capturedDeleteListener!('m-bg'); });

    const cached = queryClient.getQueryData(queryKeys.messages.infinite('conv-other')) as any;
    expect(cached.pages[0].messages).toHaveLength(0);
  });

  it('advances the preview of the conversation that owned the deleted message, not the active one', () => {
    const { queryClient, wrapper } = createTestHarness('conv-active');
    const older = makeMessage({ id: 'm-bg-old', conversationId: 'conv-other', content: 'older', createdAt: new Date('2026-01-01T00:00:00Z') });
    const newer = makeMessage({ id: 'm-bg-new', conversationId: 'conv-other', content: 'newer', createdAt: new Date('2026-01-01T00:01:00Z') });
    queryClient.setQueryData(queryKeys.messages.infinite('conv-other'), {
      pages: [{ messages: [newer, older], hasMore: false, total: 2 }],
      pageParams: [1],
    });
    seedConversations(queryClient, [
      { id: 'conv-other', lastMessage: newer, lastMessageAt: newer.createdAt, updatedAt: newer.createdAt } as any,
    ]);

    renderHook(() => useSocketCacheSync({ conversationId: 'conv-active', enabled: true }), { wrapper });

    act(() => { capturedDeleteListener!('m-bg-new'); });

    const convs = cachedConversations(queryClient);
    expect(convs[0].lastMessage?.id).toBe('m-bg-old');
  });

  it('removes the message from EVERY cached list holding it, including an alias entry', () => {
    // The same conversation can be cached under its ObjectId and under an
    // identifier alias ("meeshy" on the home page). Cleaning only one left the
    // deleted bubble visible on the other screen.
    const objectId = '507f1f77bcf86cd799439011';
    const { queryClient, wrapper } = createTestHarness('conv-active');
    const seed = () => ({
      pages: [{ messages: [makeMessage({ id: 'm-dup', conversationId: objectId, content: 'x' })], hasMore: false, total: 1 }],
      pageParams: [1],
    });
    queryClient.setQueryData(queryKeys.messages.infinite(objectId), seed());
    queryClient.setQueryData(queryKeys.messages.infinite('meeshy'), seed());

    renderHook(() => useSocketCacheSync({ conversationId: 'conv-active', enabled: true }), { wrapper });

    act(() => { capturedDeleteListener!('m-dup'); });

    expect((queryClient.getQueryData(queryKeys.messages.infinite(objectId)) as any).pages[0].messages).toHaveLength(0);
    expect((queryClient.getQueryData(queryKeys.messages.infinite('meeshy')) as any).pages[0].messages).toHaveLength(0);
  });

  it('advances the preview of an alias-keyed conversation using the message own conversationId', () => {
    // Under an identifier alias the cache KEY ("meeshy") is not the id the
    // conversation list is keyed on (the ObjectId). Deriving the owning
    // conversation from the query key left the preview stuck on the deleted
    // message; the message row itself always carries the resolved ObjectId.
    const objectId = '507f1f77bcf86cd799439011';
    const { queryClient, wrapper } = createTestHarness('conv-active');
    const older = makeMessage({ id: 'm-alias-old', conversationId: objectId, content: 'older', createdAt: new Date('2026-01-01T00:00:00Z') });
    const newer = makeMessage({ id: 'm-alias-new', conversationId: objectId, content: 'newer', createdAt: new Date('2026-01-01T00:01:00Z') });
    queryClient.setQueryData(queryKeys.messages.infinite('meeshy'), {
      pages: [{ messages: [newer, older], hasMore: false, total: 2 }],
      pageParams: [1],
    });
    seedConversations(queryClient, [
      { id: objectId, lastMessage: newer, lastMessageAt: newer.createdAt, updatedAt: newer.createdAt } as any,
    ]);

    renderHook(() => useSocketCacheSync({ conversationId: 'conv-active', enabled: true }), { wrapper });

    act(() => { capturedDeleteListener!('m-alias-new'); });

    const convs = cachedConversations(queryClient);
    expect(convs[0].lastMessage?.id).toBe('m-alias-old');
  });

  it('leaves the preview untouched when a non-latest message is deleted', () => {
    const { queryClient, wrapper } = createTestHarness('conv-1');
    seedTwoMessages(queryClient);

    renderHook(() => useSocketCacheSync({ conversationId: 'conv-1', enabled: true }), { wrapper });

    act(() => { capturedDeleteListener!('m-old'); });

    const convs = cachedConversations(queryClient);
    expect(convs[0].lastMessage?.id).toBe('m-new');
  });

  it('does not blank the preview when no message remains in cache', () => {
    const { queryClient, wrapper } = createTestHarness('conv-1');
    const only = makeMessage({ id: 'm-only', conversationId: 'conv-1', content: 'only' });
    queryClient.setQueryData(queryKeys.messages.infinite('conv-1'), {
      pages: [{ messages: [only], hasMore: false, total: 1 }],
      pageParams: [1],
    });
    seedConversations(queryClient, [
      { id: 'conv-1', lastMessage: only, lastMessageAt: only.createdAt, updatedAt: only.createdAt } as any,
    ]);

    renderHook(() => useSocketCacheSync({ conversationId: 'conv-1', enabled: true }), { wrapper });

    act(() => { capturedDeleteListener!('m-only'); });

    // Message removed from the thread cache…
    const cached = queryClient.getQueryData(queryKeys.messages.infinite('conv-1')) as any;
    expect(cached.pages[0].messages).toHaveLength(0);
    // …but the preview is left as-is rather than blanked (older messages may
    // exist server-side but not be loaded in cache).
    const convs = cachedConversations(queryClient);
    expect(convs[0].lastMessage?.id).toBe('m-only');
  });
});

describe('useSocketCacheSync — translations apply beyond the active conversation', () => {
  beforeEach(() => {
    capturedTranslationListener = null;
    capturedAudioTranslationListener = null;
    jest.clearAllMocks();
  });

  function makeTranslation(messageId: string, targetLanguage: string, content: string) {
    return {
      id: `${messageId}_${targetLanguage}`,
      messageId,
      sourceLanguage: 'en',
      targetLanguage,
      translatedContent: content,
      translationModel: 'medium',
      cacheKey: `${messageId}_en_${targetLanguage}`,
      cached: false,
    };
  }

  it('applies a text translation to a message in a NON-active conversation', () => {
    // Hook is mounted for the active conversation, but the socket is joined to
    // every conversation room the user belongs to, so translation events arrive
    // for background conversations too. TranslationEvent carries no
    // conversationId — the write must be routed by messageId across all cached
    // message lists, not only the active one.
    const { queryClient, wrapper } = createTestHarness('conv-active');

    const bgMessage = makeMessage({ id: 'm-bg', conversationId: 'conv-other', content: 'Hello', originalLanguage: 'en' });
    queryClient.setQueryData(queryKeys.messages.infinite('conv-other'), {
      pages: [{ messages: [bgMessage], hasMore: false, total: 1 }],
      pageParams: [1],
    });

    renderHook(() => useSocketCacheSync({ conversationId: 'conv-active', enabled: true }), { wrapper });
    expect(capturedTranslationListener).not.toBeNull();

    act(() => {
      capturedTranslationListener!({ messageId: 'm-bg', translations: [makeTranslation('m-bg', 'fr', 'Bonjour')] });
    });

    const cached = queryClient.getQueryData(queryKeys.messages.infinite('conv-other')) as any;
    const translations = cached.pages[0].messages[0].translations;
    expect(Array.isArray(translations)).toBe(true);
    expect(translations.find((t: any) => t.targetLanguage === 'fr')?.translatedContent).toBe('Bonjour');
  });

  it('still applies a text translation to the active conversation (regression guard)', () => {
    const { queryClient, wrapper } = createTestHarness('conv-active');
    const msg = makeMessage({ id: 'm-active', conversationId: 'conv-active', content: 'Hello', originalLanguage: 'en' });
    queryClient.setQueryData(queryKeys.messages.infinite('conv-active'), {
      pages: [{ messages: [msg], hasMore: false, total: 1 }],
      pageParams: [1],
    });

    renderHook(() => useSocketCacheSync({ conversationId: 'conv-active', enabled: true }), { wrapper });

    act(() => {
      capturedTranslationListener!({ messageId: 'm-active', translations: [makeTranslation('m-active', 'fr', 'Bonjour')] });
    });

    const cached = queryClient.getQueryData(queryKeys.messages.infinite('conv-active')) as any;
    expect(cached.pages[0].messages[0].translations.find((t: any) => t.targetLanguage === 'fr')?.translatedContent).toBe('Bonjour');
  });

  it('dedups a re-translated language rather than appending a duplicate', () => {
    const { queryClient, wrapper } = createTestHarness('conv-active');
    const msg = makeMessage({ id: 'm-1', conversationId: 'conv-other', content: 'Hello', originalLanguage: 'en' });
    (msg as any).translations = [makeTranslation('m-1', 'fr', 'Bonjour')];
    queryClient.setQueryData(queryKeys.messages.infinite('conv-other'), {
      pages: [{ messages: [msg], hasMore: false, total: 1 }],
      pageParams: [1],
    });

    renderHook(() => useSocketCacheSync({ conversationId: 'conv-active', enabled: true }), { wrapper });

    act(() => {
      capturedTranslationListener!({ messageId: 'm-1', translations: [makeTranslation('m-1', 'fr', 'Salut')] });
    });

    const cached = queryClient.getQueryData(queryKeys.messages.infinite('conv-other')) as any;
    const frTranslations = cached.pages[0].messages[0].translations.filter((t: any) => t.targetLanguage === 'fr');
    expect(frTranslations).toHaveLength(1);
    expect(frTranslations[0].translatedContent).toBe('Salut');
  });

  it('applies an audio translation to a message in a NON-active conversation via data.conversationId', () => {
    const { queryClient, wrapper } = createTestHarness('conv-active');
    const bgMessage = makeMessage({ id: 'm-audio', conversationId: 'conv-other', content: '', messageType: 'audio' });
    queryClient.setQueryData(queryKeys.messages.infinite('conv-other'), {
      pages: [{ messages: [bgMessage], hasMore: false, total: 1 }],
      pageParams: [1],
    });

    renderHook(() => useSocketCacheSync({ conversationId: 'conv-active', enabled: true }), { wrapper });
    expect(capturedAudioTranslationListener).not.toBeNull();

    act(() => {
      capturedAudioTranslationListener!({
        messageId: 'm-audio',
        attachmentId: 'att-1',
        conversationId: 'conv-other',
        language: 'fr',
        translatedAudio: { id: 'a1', targetLanguage: 'fr', url: 'https://x/fr.mp3', transcription: 'Bonjour', durationMs: 1000, format: 'mp3', cloned: false, quality: 0.9, ttsModel: 'x' },
      });
    });

    const cached = queryClient.getQueryData(queryKeys.messages.infinite('conv-other')) as any;
    expect(cached.pages[0].messages[0].translatedAudios?.fr?.url).toBe('https://x/fr.mp3');
  });
});

describe('useSocketCacheSync — transcription routing (audio pipeline stage 1)', () => {
  beforeEach(() => {
    capturedTranscriptionListener = null;
    jest.clearAllMocks();
  });

  // Real `audio:transcription-ready` shape (TranscriptionReadyEventData): the
  // text and its language live UNDER `transcription`, and the event names the
  // attachment it belongs to.
  function makeTranscriptionEvent(overrides: Record<string, unknown> = {}) {
    return {
      messageId: 'm-audio',
      attachmentId: 'att-1',
      conversationId: 'conv-other',
      transcription: {
        id: 't-1',
        text: 'Bonjour tout le monde',
        language: 'fr',
        confidence: 0.94,
        source: 'whisper',
      },
      ...overrides,
    };
  }

  function makeAudioMessage(id: string, conversationId: string, attachments: unknown[]) {
    const msg = makeMessage({ id, conversationId, content: '', messageType: 'audio' });
    (msg as any).attachments = attachments;
    return msg;
  }

  it('applies a transcription to a message in a NON-active conversation via data.conversationId', () => {
    // The socket is joined to every conversation room the user belongs to, so a
    // voice note transcribed while the user reads ANOTHER chat arrives here.
    // Routing the write by the hook's active conversation dropped it, and
    // `staleTime: Infinity` never re-reads it.
    const { queryClient, wrapper } = createTestHarness('conv-active');
    queryClient.setQueryData(queryKeys.messages.infinite('conv-other'), {
      pages: [{
        messages: [makeAudioMessage('m-audio', 'conv-other', [
          { id: 'att-1', mimeType: 'audio/mpeg' },
        ])],
        hasMore: false,
        total: 1,
      }],
      pageParams: [1],
    });

    renderHook(() => useSocketCacheSync({ conversationId: 'conv-active', enabled: true }), { wrapper });
    expect(capturedTranscriptionListener).not.toBeNull();

    act(() => { capturedTranscriptionListener!(makeTranscriptionEvent()); });

    const cached = queryClient.getQueryData(queryKeys.messages.infinite('conv-other')) as any;
    expect(cached.pages[0].messages[0].attachments[0].transcription?.text).toBe('Bonjour tout le monde');
  });

  it('applies a transcription while NO conversation is open (conversation-list view)', () => {
    // `ConversationLayout` passes `effectiveSelectedId`, which is null on the
    // list view — the handler must still route by the event's own id.
    const { queryClient, wrapper } = createTestHarness('conv-active');
    queryClient.setQueryData(queryKeys.messages.infinite('conv-other'), {
      pages: [{
        messages: [makeAudioMessage('m-audio', 'conv-other', [
          { id: 'att-1', mimeType: 'audio/mpeg' },
        ])],
        hasMore: false,
        total: 1,
      }],
      pageParams: [1],
    });

    renderHook(() => useSocketCacheSync({ conversationId: null, enabled: true }), { wrapper });

    act(() => { capturedTranscriptionListener!(makeTranscriptionEvent()); });

    const cached = queryClient.getQueryData(queryKeys.messages.infinite('conv-other')) as any;
    expect(cached.pages[0].messages[0].attachments[0].transcription?.text).toBe('Bonjour tout le monde');
  });

  it('attaches the transcription to the attachment named by data.attachmentId, not the first audio one', () => {
    // A message can carry several voice notes; each is transcribed by its own
    // event. Picking the first audio attachment mis-attributed every one of
    // them to the first note and left the others permanently untranscribed.
    const { queryClient, wrapper } = createTestHarness('conv-active');
    queryClient.setQueryData(queryKeys.messages.infinite('conv-active'), {
      pages: [{
        messages: [makeAudioMessage('m-audio', 'conv-active', [
          { id: 'att-1', mimeType: 'audio/mpeg' },
          { id: 'att-2', mimeType: 'audio/mpeg' },
        ])],
        hasMore: false,
        total: 1,
      }],
      pageParams: [1],
    });

    renderHook(() => useSocketCacheSync({ conversationId: 'conv-active', enabled: true }), { wrapper });

    act(() => {
      capturedTranscriptionListener!(makeTranscriptionEvent({
        conversationId: 'conv-active',
        attachmentId: 'att-2',
      }));
    });

    const attachments = (queryClient.getQueryData(queryKeys.messages.infinite('conv-active')) as any)
      .pages[0].messages[0].attachments;
    expect(attachments[1].transcription?.text).toBe('Bonjour tout le monde');
    expect(attachments[0].transcription).toBeUndefined();
  });

  it('records the transcription language from data.transcription.language', () => {
    // The language lives under `transcription`, never at the payload root —
    // reading `data.language` stamped `undefined` on every transcription.
    const { queryClient, wrapper } = createTestHarness('conv-active');
    queryClient.setQueryData(queryKeys.messages.infinite('conv-active'), {
      pages: [{
        messages: [makeAudioMessage('m-audio', 'conv-active', [
          { id: 'att-1', mimeType: 'audio/mpeg' },
        ])],
        hasMore: false,
        total: 1,
      }],
      pageParams: [1],
    });

    renderHook(() => useSocketCacheSync({ conversationId: 'conv-active', enabled: true }), { wrapper });

    act(() => {
      capturedTranscriptionListener!(makeTranscriptionEvent({ conversationId: 'conv-active' }));
    });

    const message = (queryClient.getQueryData(queryKeys.messages.infinite('conv-active')) as any)
      .pages[0].messages[0];
    expect(message.attachments[0].transcriptionLanguage).toBe('fr');
    expect(message.transcriptionLanguage).toBe('fr');
  });

  it('also updates an identifier-keyed (alias) cache entry for the same conversation', () => {
    // The home page mounts the global conversation as "meeshy" while socket
    // payloads carry the resolved ObjectId — the same alias gap
    // `messageCacheKeysFor` exists to close for new/edited messages.
    const objectId = '507f1f77bcf86cd799439011';
    const { queryClient, wrapper } = createTestHarness('conv-active');
    queryClient.setQueryData(queryKeys.messages.infinite('meeshy'), {
      pages: [{
        messages: [makeAudioMessage('m-audio', objectId, [
          { id: 'att-1', mimeType: 'audio/mpeg' },
        ])],
        hasMore: false,
        total: 1,
      }],
      pageParams: [1],
    });

    renderHook(() => useSocketCacheSync({ conversationId: 'conv-active', enabled: true }), { wrapper });

    act(() => {
      capturedTranscriptionListener!(makeTranscriptionEvent({ conversationId: objectId }));
    });

    const cached = queryClient.getQueryData(queryKeys.messages.infinite('meeshy')) as any;
    expect(cached.pages[0].messages[0].attachments[0].transcription?.text).toBe('Bonjour tout le monde');
  });
});

describe('useSocketCacheSync — every message write reaches the alias-keyed cache entry', () => {
  // A conversation can be cached twice at once: under its resolved ObjectId
  // (`/conversations/:id`) and under its identifier — the home page mounts the
  // global conversation as "meeshy" (`apps/web/app/page.tsx`). Socket payloads
  // only ever carry the ObjectId, so a handler writing to the single key
  // `queryKeys.messages.infinite(objectId)` silently no-ops on the alias entry,
  // and `staleTime: Infinity` never re-reads it: the home-page bubble stays
  // frozen until a manual refresh. `messageCacheKeysFor` is the source of truth
  // for "every cached list that belongs to this conversation"; each test below
  // seeds BOTH entries and asserts BOTH, so the canonical path stays guarded.
  const objectId = '507f1f77bcf86cd799439011';

  beforeEach(() => {
    capturedAudioTranslationListener = null;
    capturedAttachmentUpdatedListener = null;
    capturedAttachmentStatusListener = null;
    capturedMessagePinnedListener = null;
    capturedMessageUnpinnedListener = null;
    capturedLinkMessageNewListener = null;
    jest.clearAllMocks();
  });

  function seedBothEntries(queryClient: QueryClient, message: Message) {
    const page = () => ({
      pages: [{ messages: [{ ...message }], hasMore: false, total: 1 }],
      pageParams: [1],
    });
    queryClient.setQueryData(queryKeys.messages.infinite(objectId), page());
    queryClient.setQueryData(queryKeys.messages.infinite('meeshy'), page());
  }

  function readBoth(queryClient: QueryClient) {
    const at = (key: readonly unknown[]) => (queryClient.getQueryData(key) as any).pages[0].messages;
    return {
      canonical: at(queryKeys.messages.infinite(objectId)),
      alias: at(queryKeys.messages.infinite('meeshy')),
    };
  }

  it('applies an audio translation to the alias entry', () => {
    const { queryClient, wrapper } = createTestHarness('conv-active');
    seedBothEntries(queryClient, makeMessage({ id: 'm-audio', conversationId: objectId, messageType: 'audio' }));

    renderHook(() => useSocketCacheSync({ conversationId: 'conv-active', enabled: true }), { wrapper });

    act(() => {
      capturedAudioTranslationListener!({
        messageId: 'm-audio',
        attachmentId: 'att-1',
        conversationId: objectId,
        language: 'fr',
        translatedAudio: { id: 'a1', targetLanguage: 'fr', url: 'https://x/fr.mp3' },
      });
    });

    const { canonical, alias } = readBoth(queryClient);
    expect(canonical[0].translatedAudios?.fr?.url).toBe('https://x/fr.mp3');
    expect(alias[0].translatedAudios?.fr?.url).toBe('https://x/fr.mp3');
  });

  it('applies an enriched attachment to the alias entry', () => {
    const { queryClient, wrapper } = createTestHarness('conv-active');
    const message = makeMessage({ id: 'm-att', conversationId: objectId });
    (message as any).attachments = [{ id: 'att-1', mimeType: 'audio/mpeg' }];
    seedBothEntries(queryClient, message);

    renderHook(() => useSocketCacheSync({ conversationId: 'conv-active', enabled: true }), { wrapper });

    act(() => {
      capturedAttachmentUpdatedListener!({
        conversationId: objectId,
        messageId: 'm-att',
        attachment: { id: 'att-1', transcription: { text: 'Bonjour' } },
      });
    });

    const { canonical, alias } = readBoth(queryClient);
    expect(canonical[0].attachments[0].transcription?.text).toBe('Bonjour');
    expect(alias[0].attachments[0].transcription?.text).toBe('Bonjour');
  });

  it('applies an attachment consumption status to the alias entry', () => {
    const { queryClient, wrapper } = createTestHarness('conv-active');
    const message = makeMessage({ id: 'm-att', conversationId: objectId });
    (message as any).attachments = [{ id: 'att-1', mimeType: 'audio/mpeg' }];
    seedBothEntries(queryClient, message);

    renderHook(() => useSocketCacheSync({ conversationId: 'conv-active', enabled: true }), { wrapper });

    act(() => {
      capturedAttachmentStatusListener!({
        attachmentId: 'att-1',
        messageId: 'm-att',
        conversationId: objectId,
        userId: 'current-user',
        action: 'listened',
      });
    });

    const { canonical, alias } = readBoth(queryClient);
    expect(canonical[0].attachments[0].listenedAt).toBeDefined();
    expect(alias[0].attachments[0].listenedAt).toBeDefined();
  });

  it('stamps no field for an unrecognised consumption action', () => {
    // The action→field lookup must reject an unknown action before it is used
    // as a computed key: `{ ...a, [undefined]: ts }` writes a literal
    // "undefined" property onto the attachment, on every cached entry.
    const { queryClient, wrapper } = createTestHarness('conv-active');
    const message = makeMessage({ id: 'm-att', conversationId: objectId });
    (message as any).attachments = [{ id: 'att-1', mimeType: 'audio/mpeg' }];
    seedBothEntries(queryClient, message);

    renderHook(() => useSocketCacheSync({ conversationId: 'conv-active', enabled: true }), { wrapper });

    act(() => {
      capturedAttachmentStatusListener!({
        attachmentId: 'att-1',
        messageId: 'm-att',
        conversationId: objectId,
        userId: 'current-user',
        action: 'reacted',
      });
    });

    const { canonical, alias } = readBoth(queryClient);
    expect(Object.keys(canonical[0].attachments[0])).toEqual(['id', 'mimeType']);
    expect(Object.keys(alias[0].attachments[0])).toEqual(['id', 'mimeType']);
  });

  it('applies pin metadata to the alias entry', () => {
    const { queryClient, wrapper } = createTestHarness('conv-active');
    seedBothEntries(queryClient, makeMessage({ id: 'm-pin', conversationId: objectId }));

    renderHook(() => useSocketCacheSync({ conversationId: 'conv-active', enabled: true }), { wrapper });

    act(() => {
      capturedMessagePinnedListener!({
        messageId: 'm-pin',
        conversationId: objectId,
        pinnedBy: 'user-9',
        pinnedAt: '2026-08-07T10:00:00Z',
      });
    });

    const { canonical, alias } = readBoth(queryClient);
    expect(canonical[0].pinnedBy).toBe('user-9');
    expect(alias[0].pinnedBy).toBe('user-9');
  });

  it('clears pin metadata from the alias entry', () => {
    const { queryClient, wrapper } = createTestHarness('conv-active');
    const message = makeMessage({ id: 'm-pin', conversationId: objectId });
    (message as any).pinnedBy = 'user-9';
    (message as any).pinnedAt = '2026-08-07T10:00:00Z';
    seedBothEntries(queryClient, message);

    renderHook(() => useSocketCacheSync({ conversationId: 'conv-active', enabled: true }), { wrapper });

    act(() => {
      capturedMessageUnpinnedListener!({ messageId: 'm-pin', conversationId: objectId });
    });

    const { canonical, alias } = readBoth(queryClient);
    expect(canonical[0].pinnedBy).toBeUndefined();
    expect(alias[0].pinnedBy).toBeUndefined();
  });

  it('prepends a link-preview message to the alias entry', () => {
    const { queryClient, wrapper } = createTestHarness('conv-active');
    seedBothEntries(queryClient, makeMessage({ id: 'm-existing', conversationId: objectId }));

    renderHook(() => useSocketCacheSync({ conversationId: 'conv-active', enabled: true }), { wrapper });

    act(() => {
      capturedLinkMessageNewListener!({
        message: makeMessage({ id: 'm-link', conversationId: objectId, content: 'https://example.com' }),
      });
    });

    const { canonical, alias } = readBoth(queryClient);
    expect(canonical.map((m: Message) => m.id)).toEqual(['m-link', 'm-existing']);
    expect(alias.map((m: Message) => m.id)).toEqual(['m-link', 'm-existing']);
  });

  it('does not duplicate a link-preview message already present in the alias entry', () => {
    const { queryClient, wrapper } = createTestHarness('conv-active');
    seedBothEntries(queryClient, makeMessage({ id: 'm-link', conversationId: objectId, content: 'https://example.com' }));

    renderHook(() => useSocketCacheSync({ conversationId: 'conv-active', enabled: true }), { wrapper });

    act(() => {
      capturedLinkMessageNewListener!({
        message: makeMessage({ id: 'm-link', conversationId: objectId, content: 'https://example.com' }),
      });
    });

    const { canonical, alias } = readBoth(queryClient);
    expect(canonical).toHaveLength(1);
    expect(alias).toHaveLength(1);
  });
});

// ─── user:preferences-updated (scope conversation) ───────────────────────────
//
// `writeConversationPreferences` diffuse à TOUS les appareils du même
// utilisateur. Le web ne traitait que deux des trois scopes de l'union : la
// branche `conversationId` sortait sans rien faire, donc un épinglage / une
// coupure de son / un archivage fait ailleurs n'atteignait jamais un onglet
// ouvert — la liste gardait son état, et son tri, jusqu'à un rechargement.

describe('useSocketCacheSync — user:preferences-updated', () => {
  beforeEach(() => {
    capturedPreferencesListener = null;
    applyRemotePreferencesMock.mockClear();
    applyReadingModePreferenceBroadcastMock.mockClear();
    readingModesFlagActive = false;
    jest.clearAllMocks();
  });

  const conversationScopeEvent = {
    userId: 'current-user',
    conversationId: 'conv-1',
    version: 4,
    reset: false,
    preferences: {
      isPinned: true,
      isMuted: false,
      mentionsOnly: false,
      isArchived: false,
      tags: [],
      categoryId: null,
      orderInCategory: null,
      customName: null,
      reaction: null,
      deletedForUserAt: null,
      clearHistoryBefore: null,
    },
  };

  it('routes the conversation scope to the preferences store', () => {
    const { wrapper } = createTestHarness('conv-1');
    renderHook(() => useSocketCacheSync({ conversationId: 'conv-1', enabled: true }), { wrapper });

    expect(capturedPreferencesListener).not.toBeNull();
    act(() => { capturedPreferencesListener!(conversationScopeEvent); });

    expect(applyRemotePreferencesMock).toHaveBeenCalledWith(conversationScopeEvent);
  });

  it('routes a reset (DELETE) of the conversation scope too', () => {
    // Le reset porte `conversationId` et `preferences: null` : c'est le MÊME
    // scope, et l'oublier laisserait la remise à zéro invisible.
    const { wrapper } = createTestHarness('conv-1');
    renderHook(() => useSocketCacheSync({ conversationId: 'conv-1', enabled: true }), { wrapper });

    const resetEvent = { userId: 'current-user', conversationId: 'conv-1', version: 5, reset: true, preferences: null };
    act(() => { capturedPreferencesListener!(resetEvent); });

    expect(applyRemotePreferencesMock).toHaveBeenCalledWith(resetEvent);
  });

  it('does not send the category scope to the conversation store', () => {
    const { wrapper } = createTestHarness('conv-1');
    renderHook(() => useSocketCacheSync({ conversationId: 'conv-1', enabled: true }), { wrapper });

    act(() => { capturedPreferencesListener!({ userId: 'current-user', category: 'notifications' }); });

    expect(applyRemotePreferencesMock).not.toHaveBeenCalled();
  });

  it('does not send the community scope to the conversation store', () => {
    const { wrapper } = createTestHarness('conv-1');
    renderHook(() => useSocketCacheSync({ conversationId: 'conv-1', enabled: true }), { wrapper });

    act(() => {
      capturedPreferencesListener!({
        userId: 'current-user',
        communityId: 'comm-1',
        reset: false,
        preferences: { isPinned: true, isMuted: false, isArchived: false, isHidden: false, notificationLevel: 'all', customName: null, categoryId: null, orderInCategory: null },
      });
    });

    expect(applyRemotePreferencesMock).not.toHaveBeenCalled();
  });

  // Le scope catégorie n'invalidait qu'une clé React Query, dont l'écran de
  // réglages est le seul observateur. Le bloc `privacy` que les bulles RENDENT
  // vit dans un second exemplaire (Zustand) dont `initialize()`, appelé une
  // fois au montage, était l'unique source : couper ses accusés de lecture
  // depuis le téléphone laissait les coches en place jusqu'à un rechargement.
  it('relit le double Zustand que la catégorie annoncée périme', () => {
    const { wrapper } = createTestHarness('conv-1');
    renderHook(() => useSocketCacheSync({ conversationId: 'conv-1', enabled: true }), { wrapper });

    act(() => { capturedPreferencesListener!({ userId: 'current-user', category: 'privacy' }); });

    expect(refreshMirroredPreferenceCategoryMock).toHaveBeenCalledWith('privacy');
  });

  it('passe la catégorie telle quelle — la règle du double vit à un seul site', () => {
    // Le routeur ne connaît pas la liste des catégories doublées ; il délivre
    // l'annonce, et `refreshMirroredPreferenceCategory` décide. Sans ça, la
    // liste vivrait en deux endroits et divergerait au premier ajout.
    const { wrapper } = createTestHarness('conv-1');
    renderHook(() => useSocketCacheSync({ conversationId: 'conv-1', enabled: true }), { wrapper });

    act(() => { capturedPreferencesListener!({ userId: 'current-user', category: 'audio' }); });

    expect(refreshMirroredPreferenceCategoryMock).toHaveBeenCalledWith('audio');
  });

  it('ne relit aucun double pour les scopes conversation et communauté', () => {
    const { wrapper } = createTestHarness('conv-1');
    renderHook(() => useSocketCacheSync({ conversationId: 'conv-1', enabled: true }), { wrapper });

    act(() => { capturedPreferencesListener!(conversationScopeEvent); });
    act(() => {
      capturedPreferencesListener!({
        userId: 'current-user',
        communityId: 'comm-1',
        reset: false,
        preferences: { isPinned: true, isMuted: false, isArchived: false, isHidden: false, notificationLevel: 'all', customName: null, categoryId: null, orderInCategory: null },
      });
    });

    expect(refreshMirroredPreferenceCategoryMock).not.toHaveBeenCalled();
  });
});

/**
 * `user:preferences-community-reordered` — le glisser-déposer d'une COMMUNAUTÉ
 * fait sur un autre appareil.
 *
 * Les préférences de communauté vivent dans React Query (`staleTime: Infinity`,
 * socket en source primaire), pas dans le magasin Zustand des conversations :
 * l'invalidation est donc le levier, exactement comme pour le scope communauté
 * de `user:preferences-updated` quelques lignes plus haut.
 *
 * `orderInCategory` appartient AUSSI à la ligne de détail, d'où l'invalidation
 * de chaque communauté nommée en plus de la liste — c'est ce qui rend la charge
 * utile de l'événement nécessaire, et pas seulement le fait qu'il ait eu lieu.
 */
describe('useSocketCacheSync — user:preferences-community-reordered', () => {
  beforeEach(() => {
    capturedCommunityPreferencesReorderedListener = null;
    jest.clearAllMocks();
  });

  it('invalidates the community preferences list and every named community', () => {
    const { queryClient, wrapper } = createTestHarness('conv-1');
    renderHook(() => useSocketCacheSync({ conversationId: 'conv-1', enabled: true }), { wrapper });

    const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

    act(() => {
      capturedCommunityPreferencesReorderedListener!({
        userId: 'current-user',
        updates: [
          { communityId: 'comm-1', orderInCategory: 0 },
          { communityId: 'comm-2', orderInCategory: 1 },
        ],
      });
    });

    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: queryKeys.communities.preferences.list(),
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: queryKeys.communities.preferences.detail('comm-1'),
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: queryKeys.communities.preferences.detail('comm-2'),
    });
  });

  /**
   * Un événement sans rien d'écrit n'a rien à invalider. Le gateway ne l'émet
   * pas dans ce cas ; le client ne doit pas non plus déclencher un refetch sur
   * une charge vide venue d'une version voisine.
   */
  it('invalidates nothing on an empty update list', () => {
    const { queryClient, wrapper } = createTestHarness('conv-1');
    renderHook(() => useSocketCacheSync({ conversationId: 'conv-1', enabled: true }), { wrapper });

    const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

    act(() => {
      capturedCommunityPreferencesReorderedListener!({ userId: 'current-user', updates: [] });
    });

    expect(invalidateSpy).not.toHaveBeenCalled();
  });

  /**
   * Garde de CONTRAT : le réordonnancement de communauté ne touche jamais le
   * magasin des préférences de CONVERSATION. Les deux gestes ont des événements
   * distincts précisément parce que leurs charges ne sont pas interchangeables.
   */
  it('never reaches the conversation preferences store', () => {
    const { wrapper } = createTestHarness('conv-1');
    renderHook(() => useSocketCacheSync({ conversationId: 'conv-1', enabled: true }), { wrapper });

    act(() => {
      capturedCommunityPreferencesReorderedListener!({
        userId: 'current-user',
        updates: [{ communityId: 'comm-1', orderInCategory: 0 }],
      });
    });

    expect(applyRemoteReorderMock).not.toHaveBeenCalled();
  });
});

// D-4 / R5-6, point 3(c) — le MÊME événement `user:preferences-updated`
// (scope conversation) nourrit AUSSI le magasin scopé de mode de lecture,
// gardé par `reading_modes` — pendant web de
// `MeeshyApp.swift:onReadingModePreferenceChanged`.
describe('useSocketCacheSync — user:preferences-updated forwards to the reading-mode broadcast handler (D-4)', () => {
  beforeEach(() => {
    capturedPreferencesListener = null;
    applyReadingModePreferenceBroadcastMock.mockClear();
    jest.clearAllMocks();
  });

  const conversationScopeEvent = {
    userId: 'current-user',
    conversationId: 'conv-1',
    version: 4,
    reset: false,
    preferences: {
      isPinned: true,
      isMuted: false,
      mentionsOnly: false,
      isArchived: false,
      tags: [],
      categoryId: null,
      orderInCategory: null,
      customName: null,
      reaction: null,
      readingMode: 'focal',
      deletedForUserAt: null,
      clearHistoryBefore: null,
    },
  };

  it('forwards the conversation scope, with the CURRENT flag state, drapeau ALLUMÉ', () => {
    readingModesFlagActive = true;
    const { wrapper } = createTestHarness('conv-1');
    renderHook(() => useSocketCacheSync({ conversationId: 'conv-1', enabled: true }), { wrapper });

    act(() => { capturedPreferencesListener!(conversationScopeEvent); });

    expect(applyReadingModePreferenceBroadcastMock).toHaveBeenCalledWith(conversationScopeEvent, true);
  });

  it('forwards the conversation scope, with the CURRENT flag state, drapeau ÉTEINT', () => {
    readingModesFlagActive = false;
    const { wrapper } = createTestHarness('conv-1');
    renderHook(() => useSocketCacheSync({ conversationId: 'conv-1', enabled: true }), { wrapper });

    act(() => { capturedPreferencesListener!(conversationScopeEvent); });

    expect(applyReadingModePreferenceBroadcastMock).toHaveBeenCalledWith(conversationScopeEvent, false);
  });

  it('does not forward the category scope', () => {
    readingModesFlagActive = true;
    const { wrapper } = createTestHarness('conv-1');
    renderHook(() => useSocketCacheSync({ conversationId: 'conv-1', enabled: true }), { wrapper });

    act(() => { capturedPreferencesListener!({ userId: 'current-user', category: 'notifications' }); });

    expect(applyReadingModePreferenceBroadcastMock).not.toHaveBeenCalled();
  });
});

/**
 * Cycle 54 — la carte du Prisme de la ligne de liste, sur les chemins LOCAUX.
 *
 * `formatLastMessage` PRÉFÈRE `conversation.lastMessageTranslations` à
 * `lastMessage.content`. Réécrire l'objet `lastMessage` sans périmer cette carte
 * — ce que faisaient les cinq écrivains locaux — laissait la ligne rendre le
 * TEXTE de l'ancien message sous l'auteur et l'horodatage du nouveau.
 *
 * Les témoins portent sur le TEXTE AFFICHÉ, pas sur la donnée : un témoin posé
 * sur `lastMessage.id` serait passé au vert tout du long (leçon 212).
 */
describe('useSocketCacheSync — la carte du Prisme suit le message que la ligne décrit', () => {
  beforeEach(() => {
    capturedMessageListener = null;
    capturedDeleteListener = null;
    capturedEditListener = null;
    capturedLinkMessageNewListener = null;
    jest.clearAllMocks();
  });

  /** Ce que la ligne sert à un lecteur francophone. */
  function displayedText(conv: Conversation): string | null | undefined {
    return resolveLastMessagePreview({
      preview: conv.lastMessage?.content,
      translations: conv.lastMessageTranslations,
      originalLanguage: conv.lastMessageOriginalLanguage,
      preferredLanguages: ['fr'],
    });
  }

  const previous = makeMessage({
    id: 'm-previous',
    conversationId: 'conv-1',
    content: 'Good evening',
    originalLanguage: 'en',
    createdAt: new Date('2026-08-17T09:00:00Z'),
  });

  /** L'état nominal d'un `GET /conversations` servi par le Prisme. */
  function seedTranslatedRow(queryClient: QueryClient, conversationId = 'conv-1') {
    seedConversations(queryClient, [
      {
        id: conversationId,
        lastMessage: previous,
        lastMessageAt: previous.createdAt,
        lastMessageTranslations: { fr: 'Bonsoir' },
        lastMessageOriginalLanguage: 'en',
        updatedAt: previous.createdAt,
      } as any,
    ]);
  }

  it('message:new — la ligne rend le nouveau message, pas la traduction du précédent', () => {
    const { queryClient, wrapper } = createTestHarness('conv-1');
    seedTranslatedRow(queryClient);
    renderHook(() => useSocketCacheSync({ conversationId: 'conv-1', enabled: true }), { wrapper });

    act(() => {
      capturedMessageListener!(makeMessage({
        id: 'm-incoming',
        conversationId: 'conv-1',
        content: 'Are we still on for tomorrow?',
        createdAt: new Date('2026-08-17T10:00:00Z'),
      }));
    });

    expect(displayedText(cachedConversations(queryClient)[0])).toBe('Are we still on for tomorrow?');
  });

  it('link:message:new — même exigence, et c’est le seul chemin que rien ne rattrape', () => {
    // `broadcastLinkMessage` n'émet PAS de `conversation:updated` jumeau : sur
    // une conversation de lien partagé, la carte périmée l'était DURABLEMENT.
    const { queryClient, wrapper } = createTestHarness('conv-1');
    seedTranslatedRow(queryClient);
    renderHook(() => useSocketCacheSync({ conversationId: 'conv-1', enabled: true }), { wrapper });

    act(() => {
      capturedLinkMessageNewListener!({
        message: {
          id: 'm-link',
          conversationId: 'conv-1',
          senderId: 'guest-1',
          content: 'Joining from the invite link',
          originalLanguage: 'en',
          createdAt: new Date('2026-08-17T10:00:00Z').toISOString(),
        },
      });
    });

    expect(displayedText(cachedConversations(queryClient)[0])).toBe('Joining from the invite link');
  });

  it('message:edited — la ligne rend le texte édité, jamais la traduction d’avant', () => {
    const { queryClient, wrapper } = createTestHarness('conv-1');
    seedTranslatedRow(queryClient);
    renderHook(() => useSocketCacheSync({ conversationId: 'conv-1', enabled: true }), { wrapper });

    act(() => {
      capturedEditListener!(makeMessage({
        id: 'm-previous',
        conversationId: 'conv-1',
        content: 'Good evening — correction: 9pm',
        originalLanguage: 'en',
        createdAt: previous.createdAt,
        editedAt: new Date('2026-08-17T10:00:00Z'),
      }));
    });

    expect(displayedText(cachedConversations(queryClient)[0])).toBe('Good evening — correction: 9pm');
  });

  it('message:deleted — la ligne rend le remplaçant, pas la traduction du supprimé', () => {
    const { queryClient, wrapper } = createTestHarness('conv-1');
    const survivor = makeMessage({
      id: 'm-survivor',
      conversationId: 'conv-1',
      content: 'See you there',
      originalLanguage: 'en',
      createdAt: new Date('2026-08-17T08:00:00Z'),
    });
    const doomed = makeMessage({
      id: 'm-doomed',
      conversationId: 'conv-1',
      content: 'Good evening',
      originalLanguage: 'en',
      createdAt: new Date('2026-08-17T09:00:00Z'),
    });
    queryClient.setQueryData(queryKeys.messages.infinite('conv-1'), {
      pages: [{ messages: [doomed, survivor], hasMore: false, total: 2 }],
      pageParams: [1],
    });
    seedConversations(queryClient, [
      {
        id: 'conv-1',
        lastMessage: doomed,
        lastMessageAt: doomed.createdAt,
        lastMessageTranslations: { fr: 'Bonsoir' },
        lastMessageOriginalLanguage: 'en',
        updatedAt: doomed.createdAt,
      } as any,
    ]);
    renderHook(() => useSocketCacheSync({ conversationId: 'conv-1', enabled: true }), { wrapper });

    act(() => { capturedDeleteListener!('m-doomed'); });

    expect(displayedText(cachedConversations(queryClient)[0])).toBe('See you there');
  });

  it('conversation:updated jumeau — le MÊME message garde son Prisme', () => {
    // La contre-épreuve sur le chemin le plus fréquenté : `message:new` arrive,
    // puis le fan-out serveur repose la carte avec le même id. Le second write
    // ne doit pas dépouiller la ligne de ce que le premier a installé.
    const { queryClient, wrapper } = createTestHarness('conv-1');
    seedTranslatedRow(queryClient);
    renderHook(() => useSocketCacheSync({ conversationId: 'conv-1', enabled: true }), { wrapper });

    const incoming = makeMessage({
      id: 'm-incoming',
      conversationId: 'conv-1',
      content: 'Are we still on for tomorrow?',
      originalLanguage: 'en',
      createdAt: new Date('2026-08-17T10:00:00Z'),
    });

    act(() => { capturedMessageListener!(incoming); });

    // Le jumeau serveur, appliqué comme le fait le cache (mergeConversationUpdate).
    const withCard = mergeConversationUpdate(cachedConversations(queryClient)[0], {
      conversationId: 'conv-1',
      lastMessageId: 'm-incoming',
      lastMessagePreview: incoming.content,
      lastMessageTranslations: { fr: 'On est toujours d’accord pour demain ?' },
      lastMessageOriginalLanguage: 'en',
    });

    expect(displayedText(withCard)).toBe('On est toujours d’accord pour demain ?');

    // Puis le MÊME message est réécrit localement (re-render, dédup serveur).
    act(() => { capturedMessageListener!(incoming); });

    expect(cachedConversations(queryClient)[0].lastMessage?.id).toBe('m-incoming');
  });
});

/**
 * La ligne de liste ne recule pas — le chemin `message:new`.
 *
 * Le témoin de la règle vit dans `preview-monotonicity.test.ts` ; celui-ci
 * prouve qu'elle est bien CÂBLÉE sur le handler, à l'endroit où le désordre
 * arrive vraiment : deux messages rapides dans une conversation dont la ligne
 * décrit déjà le plus récent.
 */
describe('useSocketCacheSync — la ligne de liste ne recule pas sur un `message:new` tardif', () => {
  beforeEach(() => {
    capturedMessageListener = null;
    jest.clearAllMocks();
  });

  const NEWER_AT = new Date('2026-08-17T10:00:05.000Z');
  const OLDER_AT = new Date('2026-08-17T10:00:00.000Z');

  function seedRowDescribingNewest(queryClient: QueryClient): void {
    seedConversations(queryClient, [
      {
        id: 'conv-1',
        type: 'group',
        lastMessageAt: NEWER_AT,
        lastMessage: makeMessage({
          id: 'm-newer',
          conversationId: 'conv-1',
          content: 'Le plus récent',
          createdAt: NEWER_AT,
        }),
      } as unknown as Conversation,
      { id: 'conv-2', type: 'group', lastMessageAt: NEWER_AT } as unknown as Conversation,
    ]);
  }

  it('garde l’aperçu, le rang et la position quand le message arrivé est plus ancien', () => {
    const { queryClient, wrapper } = createTestHarness('conv-1');
    seedRowDescribingNewest(queryClient);
    renderHook(() => useSocketCacheSync({ conversationId: 'conv-1', enabled: true }), { wrapper });

    act(() => {
      capturedMessageListener!(
        makeMessage({
          id: 'm-older',
          conversationId: 'conv-1',
          content: 'L’ancien',
          createdAt: OLDER_AT,
        })
      );
    });

    const [first] = cachedConversations(queryClient);
    expect(first.lastMessage?.id).toBe('m-newer');
    expect(first.lastMessageAt).toEqual(NEWER_AT);
    expect(cachedConversations(queryClient).map((c) => c.id)).toEqual(['conv-1', 'conv-2']);
  });

  it('écrit toujours le message dans le fil, même quand la ligne ne bouge pas', () => {
    const { queryClient, wrapper } = createTestHarness('conv-1');
    seedRowDescribingNewest(queryClient);
    renderHook(() => useSocketCacheSync({ conversationId: 'conv-1', enabled: true }), { wrapper });

    act(() => {
      capturedMessageListener!(
        makeMessage({ id: 'm-older', conversationId: 'conv-1', createdAt: OLDER_AT })
      );
    });

    const cached = queryClient.getQueryData(queryKeys.messages.infinite('conv-1')) as any;
    expect(cached.pages[0].messages.map((m: Message) => m.id)).toContain('m-older');
  });

  it('applique et remonte la conversation quand le message arrivé est le plus récent', () => {
    const { queryClient, wrapper } = createTestHarness('conv-1');
    seedConversations(queryClient, [
      { id: 'conv-2', type: 'group', lastMessageAt: NEWER_AT } as unknown as Conversation,
      {
        id: 'conv-1',
        type: 'group',
        lastMessageAt: OLDER_AT,
        lastMessage: makeMessage({
          id: 'm-older',
          conversationId: 'conv-1',
          content: 'L’ancien',
          createdAt: OLDER_AT,
        }),
      } as unknown as Conversation,
    ]);
    renderHook(() => useSocketCacheSync({ conversationId: 'conv-1', enabled: true }), { wrapper });

    act(() => {
      capturedMessageListener!(
        makeMessage({
          id: 'm-newer',
          conversationId: 'conv-1',
          content: 'Le plus récent',
          createdAt: NEWER_AT,
        })
      );
    });

    const cached = cachedConversations(queryClient);
    expect(cached.map((c) => c.id)).toEqual(['conv-1', 'conv-2']);
    expect(cached[0].lastMessage?.id).toBe('m-newer');
  });
});

/**
 * REV-5/B1 — maillon 3 : `conversation:unread-updated` porte désormais le
 * pont ✦ (G-123, `ConversationUnreadUpdatedEventData.bridge`,
 * `emitUnreadCountsToRecipients.ts:150-154`). Jumeau exact de
 * `ConversationSyncEngine.handleUnreadUpdated` (`ConversationSyncEngine.swift`,
 * `updated[idx].bridge = event.bridge`) : le champ est recopié
 * INCONDITIONNELLEMENT — `undefined` compris, qui EFFACE un pont déjà en
 * cache plutôt que de le laisser périmer.
 */
describe('useSocketCacheSync — le pont ✦ voyage sur `conversation:unread-updated`', () => {
  beforeEach(() => {
    capturedUnreadUpdatedListener = null;
    jest.clearAllMocks();
  });

  const bridge: ConversationBridge = {
    kind: 'fallback',
    unreadCount: 4,
    suggestedMode: 'focal',
    data: { authors: ['Alice'], extraAuthorCount: 0, messageCount: 4 },
  };

  it('un événement porteur de `bridge` écrit le pont dans la ligne de liste', () => {
    const { queryClient, wrapper } = createTestHarness('conv-1');
    seedConversations(queryClient, [
      { id: 'conv-1', type: 'group', unreadCount: 0 } as unknown as Conversation,
    ]);
    renderHook(() => useSocketCacheSync({ conversationId: 'other-conv', enabled: true }), { wrapper });

    expect(capturedUnreadUpdatedListener).not.toBeNull();

    act(() => {
      capturedUnreadUpdatedListener!({ conversationId: 'conv-1', unreadCount: 4, bridge });
    });

    const [row] = cachedConversations(queryClient);
    expect(row.unreadCount).toBe(4);
    expect(row.bridge).toEqual(bridge);
  });

  it('un `bridge: null` EXPLICITE efface un pont déjà en cache (jumeau Swift : `.cleared`)', () => {
    const { queryClient, wrapper } = createTestHarness('conv-1');
    seedConversations(queryClient, [
      { id: 'conv-1', type: 'group', unreadCount: 4, bridge } as unknown as Conversation,
    ]);
    renderHook(() => useSocketCacheSync({ conversationId: 'other-conv', enabled: true }), { wrapper });

    act(() => {
      // Le gateway AFFIRME l'absence de pont — `bridge: null` — quand
      // `unreadCount` retombe à 0 ou que sa passe a tourné sans rien annoncer
      // pour ce lecteur (contrat gelé §3.2).
      capturedUnreadUpdatedListener!({ conversationId: 'conv-1', unreadCount: 0, bridge: null });
    });

    const [row] = cachedConversations(queryClient);
    expect(row.unreadCount).toBe(0);
    expect(row.bridge).toBeUndefined();
  });

  /**
   * Cycle 63 — le témoin ci-dessus s'appelait « un événement SANS `bridge`
   * EFFACE un pont déjà en cache », et il gelait la règle qui a coûté au
   * cycle 62 le pont de TOUTES les lignes du lecteur à chaque reconnexion.
   *
   * L'omission n'a jamais voulu dire « il n'y a pas de pont » chez trois des
   * quatre émetteurs serveur : elle voulait dire « je ne l'ai pas calculé »
   * (instantané au-delà de sa borne, passe tombée, accusé de lecture). Le fil
   * sépare désormais les deux, et le silence ne détruit plus rien.
   */
  it('un événement sans la CLÉ `bridge` ne touche pas au pont en cache — le serveur n’a pas calculé', () => {
    const { queryClient, wrapper } = createTestHarness('conv-1');
    seedConversations(queryClient, [
      { id: 'conv-1', type: 'group', unreadCount: 4, bridge } as unknown as Conversation,
    ]);
    renderHook(() => useSocketCacheSync({ conversationId: 'other-conv', enabled: true }), { wrapper });

    act(() => {
      capturedUnreadUpdatedListener!({ conversationId: 'conv-1', unreadCount: 2 });
    });

    const [row] = cachedConversations(queryClient);
    expect(row.unreadCount).toBe(2);
    expect(row.bridge).toEqual(bridge);
  });
});
