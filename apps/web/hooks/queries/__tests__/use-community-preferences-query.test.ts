import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import type { UserCommunityPreferences } from '@meeshy/shared/types';

jest.mock('@/services/communities.service', () => ({
  communitiesService: {
    getPreferences: jest.fn(),
    listPreferences: jest.fn(),
    updatePreferences: jest.fn(),
    deletePreferences: jest.fn(),
    reorderPreferences: jest.fn(),
  },
}));

import { communitiesService } from '@/services/communities.service';

const mockService = communitiesService as jest.Mocked<typeof communitiesService>;

import {
  useCommunityPreferencesQuery,
  useCommunityPreferencesListQuery,
  useUpdateCommunityPreferencesMutation,
  useDeleteCommunityPreferencesMutation,
  useReorderCommunitiesMutation,
} from '../use-community-preferences-query';

function makePreferences(
  overrides: Partial<UserCommunityPreferences> & { id: string; communityId: string }
): UserCommunityPreferences {
  return {
    userId: 'user-1',
    isPinned: false,
    isMuted: false,
    isArchived: false,
    isHidden: false,
    notificationLevel: 'all' as const,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as UserCommunityPreferences;
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

describe('useCommunityPreferencesQuery', () => {
  it('fetches preferences for a community', async () => {
    const prefs = makePreferences({ id: 'p1', communityId: 'c1', isPinned: true });
    mockService.getPreferences.mockResolvedValue({ success: true, data: prefs });

    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useCommunityPreferencesQuery('c1'), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(prefs);
    expect(mockService.getPreferences).toHaveBeenCalledWith('c1');
  });

  it('is disabled when communityId is null', () => {
    const { wrapper } = createWrapper();
    renderHook(() => useCommunityPreferencesQuery(null), { wrapper });

    expect(mockService.getPreferences).not.toHaveBeenCalled();
  });
});

describe('useCommunityPreferencesListQuery', () => {
  it('fetches all community preferences', async () => {
    const prefsList = [
      makePreferences({ id: 'p1', communityId: 'c1' }),
      makePreferences({ id: 'p2', communityId: 'c2', isMuted: true }),
    ];
    mockService.listPreferences.mockResolvedValue({ success: true, data: prefsList });

    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useCommunityPreferencesListQuery(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(prefsList);
  });
});

describe('useUpdateCommunityPreferencesMutation', () => {
  it('updates preferences and invalidates caches', async () => {
    const updated = makePreferences({ id: 'p1', communityId: 'c1', isPinned: true });
    mockService.updatePreferences.mockResolvedValue({ success: true, data: updated });

    const { wrapper, queryClient } = createWrapper();
    const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

    const { result } = renderHook(() => useUpdateCommunityPreferencesMutation(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({ communityId: 'c1', data: { isPinned: true } });
    });

    expect(mockService.updatePreferences).toHaveBeenCalledWith('c1', { isPinned: true });
    expect(invalidateSpy).toHaveBeenCalled();
  });
});

describe('useDeleteCommunityPreferencesMutation', () => {
  it('deletes preferences and invalidates caches', async () => {
    mockService.deletePreferences.mockResolvedValue({ success: true });

    const { wrapper, queryClient } = createWrapper();
    const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

    const { result } = renderHook(() => useDeleteCommunityPreferencesMutation(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync('c1');
    });

    expect(mockService.deletePreferences).toHaveBeenCalledWith('c1');
    expect(invalidateSpy).toHaveBeenCalled();
  });
});

describe('useReorderCommunitiesMutation', () => {
  it('reorders communities and invalidates list', async () => {
    mockService.reorderPreferences.mockResolvedValue({ success: true });

    const { wrapper, queryClient } = createWrapper();
    const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

    const updates = [
      { communityId: 'c1', orderInCategory: 0 },
      { communityId: 'c2', orderInCategory: 1 },
    ];

    const { result } = renderHook(() => useReorderCommunitiesMutation(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync(updates);
    });

    expect(mockService.reorderPreferences).toHaveBeenCalledWith(updates);
    expect(invalidateSpy).toHaveBeenCalled();
  });
});
