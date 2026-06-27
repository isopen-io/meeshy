/**
 * Tests for hooks/queries/use-conversation-preferences-query.ts
 * and hooks/queries/use-message-status-details.ts
 */

import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

// ─── Service mocks ────────────────────────────────────────────────────────────

const mockGetAllPreferences = jest.fn();
const mockGetCategories = jest.fn();
const mockTogglePin = jest.fn();
const mockToggleMute = jest.fn();
const mockToggleArchive = jest.fn();
const mockUpdateReaction = jest.fn();
const mockGetMessageStatusDetails = jest.fn();

jest.mock('@/services/user-preferences.service', () => ({
  userPreferencesService: {
    getAllPreferences: (...a: unknown[]) => mockGetAllPreferences(...a),
    getCategories: (...a: unknown[]) => mockGetCategories(...a),
    togglePin: (...a: unknown[]) => mockTogglePin(...a),
    toggleMute: (...a: unknown[]) => mockToggleMute(...a),
    toggleArchive: (...a: unknown[]) => mockToggleArchive(...a),
    updateReaction: (...a: unknown[]) => mockUpdateReaction(...a),
  },
}));

jest.mock('@/services/conversations/messages.service', () => ({
  messagesService: {
    getMessageStatusDetails: (...a: unknown[]) => mockGetMessageStatusDetails(...a),
  },
}));

jest.mock('@/lib/react-query/query-keys', () => ({
  queryKeys: {
    preferences: {
      all: ['user-preferences'],
      conversations: () => ['user-preferences', 'conversations'],
      conversation: (id: string) => ['user-preferences', 'conversations', id],
      categories: () => ['user-preferences', 'categories'],
    },
    messages: {
      statusDetails: (id: string) => ['messages', 'status-details', id],
    },
  },
}));

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0, staleTime: 0 } },
  });
  const Wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return { wrapper: Wrapper, queryClient };
}

const mockPreference = {
  conversationId: 'conv1',
  isPinned: false,
  isMuted: false,
  isArchived: false,
  reaction: null,
};

beforeEach(() => jest.clearAllMocks());

// ─── Imports ──────────────────────────────────────────────────────────────────

import {
  useConversationPreferencesQuery,
  useCategoriesQuery,
  usePreferencesMap,
  useTogglePinMutation,
  useToggleMuteMutation,
  useToggleArchiveMutation,
  useSetReactionMutation,
} from '@/hooks/queries/use-conversation-preferences-query';

import { useMessageStatusDetails } from '@/hooks/queries/use-message-status-details';

// ─── useConversationPreferencesQuery ─────────────────────────────────────────

describe('useConversationPreferencesQuery', () => {
  it('fetches all conversation preferences', async () => {
    mockGetAllPreferences.mockResolvedValue([mockPreference]);
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useConversationPreferencesQuery(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([mockPreference]);
  });

  it('is disabled when enabled=false', () => {
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useConversationPreferencesQuery(false), { wrapper });
    expect(result.current.fetchStatus).toBe('idle');
    expect(mockGetAllPreferences).not.toHaveBeenCalled();
  });
});

// ─── useCategoriesQuery ───────────────────────────────────────────────────────

describe('useCategoriesQuery', () => {
  it('fetches categories', async () => {
    const cats = [{ id: 'cat1', name: 'Work' }];
    mockGetCategories.mockResolvedValue(cats);
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useCategoriesQuery(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(cats);
  });

  it('is disabled when enabled=false', () => {
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useCategoriesQuery(false), { wrapper });
    expect(result.current.fetchStatus).toBe('idle');
  });
});

// ─── usePreferencesMap ────────────────────────────────────────────────────────

describe('usePreferencesMap', () => {
  it('returns empty map when no preferences loaded', () => {
    mockGetAllPreferences.mockImplementation(() => new Promise(() => {}));
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => usePreferencesMap(), { wrapper });
    expect(result.current.size).toBe(0);
  });

  it('returns a map keyed by conversationId', async () => {
    mockGetAllPreferences.mockResolvedValue([mockPreference, { ...mockPreference, conversationId: 'conv2' }]);
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => usePreferencesMap(), { wrapper });
    await waitFor(() => expect(result.current.size).toBe(2));
    expect(result.current.has('conv1')).toBe(true);
    expect(result.current.has('conv2')).toBe(true);
  });
});

// ─── useTogglePinMutation ─────────────────────────────────────────────────────

describe('useTogglePinMutation', () => {
  it('calls togglePin on mutate', async () => {
    mockTogglePin.mockResolvedValue({ ...mockPreference, isPinned: true });
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useTogglePinMutation(), { wrapper });
    await act(async () => {
      result.current.mutate({ conversationId: 'conv1', value: true });
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockTogglePin).toHaveBeenCalledWith('conv1', true);
  });
});

// ─── useToggleMuteMutation ────────────────────────────────────────────────────

describe('useToggleMuteMutation', () => {
  it('calls toggleMute on mutate', async () => {
    mockToggleMute.mockResolvedValue({ ...mockPreference, isMuted: true });
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useToggleMuteMutation(), { wrapper });
    await act(async () => {
      result.current.mutate({ conversationId: 'conv1', value: true });
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockToggleMute).toHaveBeenCalledWith('conv1', true);
  });
});

// ─── useToggleArchiveMutation ─────────────────────────────────────────────────

describe('useToggleArchiveMutation', () => {
  it('calls toggleArchive on mutate', async () => {
    mockToggleArchive.mockResolvedValue({ ...mockPreference, isArchived: true });
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useToggleArchiveMutation(), { wrapper });
    await act(async () => {
      result.current.mutate({ conversationId: 'conv1', value: true });
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockToggleArchive).toHaveBeenCalledWith('conv1', true);
  });
});

// ─── useSetReactionMutation ───────────────────────────────────────────────────

describe('useSetReactionMutation', () => {
  it('calls updateReaction on mutate', async () => {
    mockUpdateReaction.mockResolvedValue({ ...mockPreference, reaction: '❤️' });
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useSetReactionMutation(), { wrapper });
    await act(async () => {
      result.current.mutate({ conversationId: 'conv1', reaction: '❤️' });
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockUpdateReaction).toHaveBeenCalledWith('conv1', '❤️');
  });

  it('calls updateReaction with null to clear reaction', async () => {
    mockUpdateReaction.mockResolvedValue({ ...mockPreference, reaction: null });
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useSetReactionMutation(), { wrapper });
    await act(async () => {
      result.current.mutate({ conversationId: 'conv1', reaction: null });
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockUpdateReaction).toHaveBeenCalledWith('conv1', null);
  });
});

// ─── useMessageStatusDetails ──────────────────────────────────────────────────

describe('useMessageStatusDetails', () => {
  it('is disabled when messageId is null', () => {
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useMessageStatusDetails(null), { wrapper });
    expect(result.current.fetchStatus).toBe('idle');
    expect(mockGetMessageStatusDetails).not.toHaveBeenCalled();
  });

  it('is disabled when enabled: false', () => {
    const { wrapper } = makeWrapper();
    const { result } = renderHook(
      () => useMessageStatusDetails('msg1', { enabled: false }),
      { wrapper }
    );
    expect(result.current.fetchStatus).toBe('idle');
  });

  it('fetches status details for a message', async () => {
    const details = {
      statuses: [{ participantId: 'u1', displayName: 'Alice', deliveredAt: null, receivedAt: null, readAt: null }],
      pagination: { total: 1, limit: 50, offset: 0, hasMore: false },
    };
    mockGetMessageStatusDetails.mockResolvedValue(details);
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useMessageStatusDetails('msg1'), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockGetMessageStatusDetails).toHaveBeenCalledWith('msg1', { filter: 'all', limit: 50 });
    expect(result.current.data).toEqual(details);
  });

  it('passes custom filter to service', async () => {
    const details = { statuses: [], pagination: { total: 0, limit: 50, offset: 0, hasMore: false } };
    mockGetMessageStatusDetails.mockResolvedValue(details);
    const { wrapper } = makeWrapper();
    const { result } = renderHook(
      () => useMessageStatusDetails('msg1', { filter: 'read' }),
      { wrapper }
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockGetMessageStatusDetails).toHaveBeenCalledWith('msg1', { filter: 'read', limit: 50 });
  });
});
