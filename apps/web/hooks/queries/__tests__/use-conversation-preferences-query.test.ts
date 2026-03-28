import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import type { UserConversationPreferences } from '@meeshy/shared/types/user-preferences';

jest.mock('@/services/user-preferences.service', () => ({
  userPreferencesService: {
    getAllPreferences: jest.fn(),
    getCategories: jest.fn(),
    togglePin: jest.fn(),
    toggleMute: jest.fn(),
    toggleArchive: jest.fn(),
    updateReaction: jest.fn(),
  },
}));

import { userPreferencesService } from '@/services/user-preferences.service';

const mockService = userPreferencesService as jest.Mocked<typeof userPreferencesService>;

import {
  useConversationPreferencesQuery,
  useTogglePinMutation,
  useToggleMuteMutation,
  useToggleArchiveMutation,
  usePreferencesMap,
} from '../use-conversation-preferences-query';

function makePreferences(
  overrides: Partial<UserConversationPreferences> & { conversationId: string },
): UserConversationPreferences {
  return {
    id: `pref-${overrides.conversationId}`,
    userId: 'user-1',
    isPinned: false,
    isMuted: false,
    isArchived: false,
    tags: [],
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as UserConversationPreferences;
}

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return {
    queryClient,
    wrapper: ({ children }: { children: React.ReactNode }) =>
      React.createElement(QueryClientProvider, { client: queryClient }, children),
  };
}

afterEach(() => {
  jest.clearAllMocks();
});

describe('usePreferencesMap', () => {
  it('builds correct Map from query data', async () => {
    const prefsList = [
      makePreferences({ conversationId: 'conv-1', isPinned: true }),
      makePreferences({ conversationId: 'conv-2', isMuted: true }),
    ];
    mockService.getAllPreferences.mockResolvedValue(prefsList);

    const { wrapper } = createWrapper();
    const { result } = renderHook(() => usePreferencesMap(), { wrapper });

    await waitFor(() => expect(result.current.size).toBe(2));

    expect(result.current.get('conv-1')?.isPinned).toBe(true);
    expect(result.current.get('conv-2')?.isMuted).toBe(true);
    expect(result.current.has('conv-3')).toBe(false);
  });

  it('returns empty map when no data', () => {
    mockService.getAllPreferences.mockResolvedValue([]);

    const { wrapper } = createWrapper();
    const { result } = renderHook(() => usePreferencesMap(), { wrapper });

    expect(result.current.size).toBe(0);
  });
});

describe('useTogglePinMutation', () => {
  it('optimistically updates isPinned in cache', async () => {
    const prefsList = [
      makePreferences({ conversationId: 'conv-1', isPinned: false }),
      makePreferences({ conversationId: 'conv-2' }),
    ];
    const updated = makePreferences({ conversationId: 'conv-1', isPinned: true });
    mockService.getAllPreferences.mockResolvedValue(prefsList);
    mockService.togglePin.mockResolvedValue(updated);

    const { wrapper, queryClient } = createWrapper();

    const { result: prefsResult } = renderHook(
      () => useConversationPreferencesQuery(),
      { wrapper },
    );
    await waitFor(() => expect(prefsResult.current.isSuccess).toBe(true));

    const { result: mutationResult } = renderHook(
      () => useTogglePinMutation(),
      { wrapper },
    );

    await act(async () => {
      mutationResult.current.mutate({ conversationId: 'conv-1', value: true });
    });

    await waitFor(() => expect(mutationResult.current.isSuccess).toBe(true));
    expect(mockService.togglePin).toHaveBeenCalledWith('conv-1', true);
  });

  it('rolls back on error', async () => {
    const prefsList = [
      makePreferences({ conversationId: 'conv-1', isPinned: false }),
    ];
    mockService.getAllPreferences.mockResolvedValue(prefsList);
    mockService.togglePin.mockRejectedValue(new Error('Server error'));

    const { wrapper, queryClient } = createWrapper();

    const { result: prefsResult } = renderHook(
      () => useConversationPreferencesQuery(),
      { wrapper },
    );
    await waitFor(() => expect(prefsResult.current.isSuccess).toBe(true));

    const { result: mutationResult } = renderHook(
      () => useTogglePinMutation(),
      { wrapper },
    );

    await act(async () => {
      mutationResult.current.mutate({ conversationId: 'conv-1', value: true });
    });

    await waitFor(() => expect(mutationResult.current.isError).toBe(true));

    const cached = queryClient.getQueryData<UserConversationPreferences[]>(
      ['user-preferences', 'conversations'],
    );
    expect(cached?.[0]?.isPinned).toBe(false);
  });
});

describe('useToggleMuteMutation', () => {
  it('optimistically updates isMuted in cache', async () => {
    const prefsList = [
      makePreferences({ conversationId: 'conv-1', isMuted: false }),
    ];
    const updated = makePreferences({ conversationId: 'conv-1', isMuted: true });
    mockService.getAllPreferences.mockResolvedValue(prefsList);
    mockService.toggleMute.mockResolvedValue(updated);

    const { wrapper } = createWrapper();

    const { result: prefsResult } = renderHook(
      () => useConversationPreferencesQuery(),
      { wrapper },
    );
    await waitFor(() => expect(prefsResult.current.isSuccess).toBe(true));

    const { result: mutationResult } = renderHook(
      () => useToggleMuteMutation(),
      { wrapper },
    );

    await act(async () => {
      mutationResult.current.mutate({ conversationId: 'conv-1', value: true });
    });

    await waitFor(() => expect(mutationResult.current.isSuccess).toBe(true));
    expect(mockService.toggleMute).toHaveBeenCalledWith('conv-1', true);
  });
});

describe('useToggleArchiveMutation', () => {
  it('optimistically updates isArchived in cache', async () => {
    const prefsList = [
      makePreferences({ conversationId: 'conv-1', isArchived: false }),
    ];
    const updated = makePreferences({ conversationId: 'conv-1', isArchived: true });
    mockService.getAllPreferences.mockResolvedValue(prefsList);
    mockService.toggleArchive.mockResolvedValue(updated);

    const { wrapper } = createWrapper();

    const { result: prefsResult } = renderHook(
      () => useConversationPreferencesQuery(),
      { wrapper },
    );
    await waitFor(() => expect(prefsResult.current.isSuccess).toBe(true));

    const { result: mutationResult } = renderHook(
      () => useToggleArchiveMutation(),
      { wrapper },
    );

    await act(async () => {
      mutationResult.current.mutate({ conversationId: 'conv-1', value: true });
    });

    await waitFor(() => expect(mutationResult.current.isSuccess).toBe(true));
    expect(mockService.toggleArchive).toHaveBeenCalledWith('conv-1', true);
  });
});
