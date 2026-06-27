/**
 * Tests for hooks/queries/use-communities-query.ts
 * and hooks/queries/use-community-preferences-query.ts
 */

import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

// ─── Service mocks ────────────────────────────────────────────────────────────

const mockGetCommunities = jest.fn();
const mockGetCommunity = jest.fn();
const mockSearchCommunities = jest.fn();
const mockGetCommunityConversations = jest.fn();
const mockGetMembers = jest.fn();
const mockCheckIdentifier = jest.fn();
const mockCreateCommunity = jest.fn();
const mockUpdateCommunity = jest.fn();
const mockDeleteCommunity = jest.fn();
const mockJoinCommunity = jest.fn();
const mockLeaveCommunity = jest.fn();
const mockAddMember = jest.fn();
const mockRemoveMember = jest.fn();
const mockUpdateMemberRole = jest.fn();
const mockGetPreferences = jest.fn();
const mockListPreferences = jest.fn();
const mockUpdatePreferences = jest.fn();
const mockDeletePreferences = jest.fn();
const mockReorderPreferences = jest.fn();

jest.mock('@/services/communities.service', () => ({
  communitiesService: {
    getCommunities: (...a: unknown[]) => mockGetCommunities(...a),
    getCommunity: (...a: unknown[]) => mockGetCommunity(...a),
    searchCommunities: (...a: unknown[]) => mockSearchCommunities(...a),
    getCommunityConversations: (...a: unknown[]) => mockGetCommunityConversations(...a),
    getMembers: (...a: unknown[]) => mockGetMembers(...a),
    checkIdentifier: (...a: unknown[]) => mockCheckIdentifier(...a),
    createCommunity: (...a: unknown[]) => mockCreateCommunity(...a),
    updateCommunity: (...a: unknown[]) => mockUpdateCommunity(...a),
    deleteCommunity: (...a: unknown[]) => mockDeleteCommunity(...a),
    joinCommunity: (...a: unknown[]) => mockJoinCommunity(...a),
    leaveCommunity: (...a: unknown[]) => mockLeaveCommunity(...a),
    addMember: (...a: unknown[]) => mockAddMember(...a),
    removeMember: (...a: unknown[]) => mockRemoveMember(...a),
    updateMemberRole: (...a: unknown[]) => mockUpdateMemberRole(...a),
    getPreferences: (...a: unknown[]) => mockGetPreferences(...a),
    listPreferences: (...a: unknown[]) => mockListPreferences(...a),
    updatePreferences: (...a: unknown[]) => mockUpdatePreferences(...a),
    deletePreferences: (...a: unknown[]) => mockDeletePreferences(...a),
    reorderPreferences: (...a: unknown[]) => mockReorderPreferences(...a),
  },
}));

jest.mock('@/lib/react-query/query-keys', () => ({
  queryKeys: {
    communities: {
      all: ['communities'],
      lists: () => ['communities', 'list'],
      list: (f?: unknown) => ['communities', 'list', f],
      search: (q: string) => ['communities', 'search', q],
      detail: (id: string) => ['communities', id],
      members: (id: string) => ['communities', id, 'members'],
      conversations: (id: string) => ['communities', id, 'conversations'],
      identifierCheck: (id: string) => ['communities', 'identifier-check', id],
      preferences: {
        all: ['communities', 'preferences'],
        detail: (id: string) => ['communities', 'preferences', id],
        list: () => ['communities', 'preferences', 'list'],
      },
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

const mockCommunity = { id: 'c1', name: 'Devs', identifier: 'devs' };
const mockMember = { id: 'm1', userId: 'u1', role: 'MEMBER' as const };
const mockConversation = { id: 'conv1', title: 'General' };

beforeEach(() => jest.clearAllMocks());

// ─── useCommunitiesQuery ──────────────────────────────────────────────────────

import {
  useCommunitiesQuery,
  useCommunityQuery,
  useCommunitySearchQuery,
  useCommunityConversationsQuery,
  useCommunityMembersQuery,
  useCheckIdentifierQuery,
  useCreateCommunityMutation,
  useUpdateCommunityMutation,
  useDeleteCommunityMutation,
  useJoinCommunityMutation,
  useLeaveCommunityMutation,
  useAddMemberMutation,
  useRemoveMemberMutation,
  useUpdateMemberRoleMutation,
} from '@/hooks/queries/use-communities-query';

import {
  useCommunityPreferencesQuery,
  useCommunityPreferencesListQuery,
  useUpdateCommunityPreferencesMutation,
  useDeleteCommunityPreferencesMutation,
  useReorderCommunitiesMutation,
} from '@/hooks/queries/use-community-preferences-query';

describe('useCommunitiesQuery', () => {
  it('fetches communities list', async () => {
    mockGetCommunities.mockResolvedValue({ data: [mockCommunity] });
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useCommunitiesQuery(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([mockCommunity]);
  });

  it('is disabled when enabled: false', () => {
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useCommunitiesQuery({ enabled: false }), { wrapper });
    expect(result.current.fetchStatus).toBe('idle');
    expect(mockGetCommunities).not.toHaveBeenCalled();
  });

  it('passes search param to service', async () => {
    mockGetCommunities.mockResolvedValue({ data: [] });
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useCommunitiesQuery({ search: 'dev' }), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockGetCommunities).toHaveBeenCalledWith({ search: 'dev' });
  });
});

describe('useCommunityQuery', () => {
  it('is disabled when id is null', () => {
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useCommunityQuery(null), { wrapper });
    expect(result.current.fetchStatus).toBe('idle');
  });

  it('fetches single community by id', async () => {
    mockGetCommunity.mockResolvedValue({ data: mockCommunity });
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useCommunityQuery('c1'), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockGetCommunity).toHaveBeenCalledWith('c1');
  });
});

describe('useCommunitySearchQuery', () => {
  it('is disabled when query length < 2', () => {
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useCommunitySearchQuery('a'), { wrapper });
    expect(result.current.fetchStatus).toBe('idle');
  });

  it('searches when query length >= 2', async () => {
    mockSearchCommunities.mockResolvedValue({ data: [mockCommunity] });
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useCommunitySearchQuery('dev'), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockSearchCommunities).toHaveBeenCalledWith('dev', 0, 20);
  });

  it('applies custom offset and limit', async () => {
    mockSearchCommunities.mockResolvedValue({ data: [] });
    const { wrapper } = makeWrapper();
    const { result } = renderHook(
      () => useCommunitySearchQuery('dev', { offset: 20, limit: 10 }),
      { wrapper }
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockSearchCommunities).toHaveBeenCalledWith('dev', 20, 10);
  });
});

describe('useCommunityConversationsQuery', () => {
  it('is disabled when communityId is null', () => {
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useCommunityConversationsQuery(null), { wrapper });
    expect(result.current.fetchStatus).toBe('idle');
  });

  it('fetches conversations for a community', async () => {
    mockGetCommunityConversations.mockResolvedValue({ data: [mockConversation] });
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useCommunityConversationsQuery('c1'), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockGetCommunityConversations).toHaveBeenCalledWith('c1');
  });
});

describe('useCommunityMembersQuery', () => {
  it('is disabled when communityId is null', () => {
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useCommunityMembersQuery(null), { wrapper });
    expect(result.current.fetchStatus).toBe('idle');
  });

  it('fetches members', async () => {
    mockGetMembers.mockResolvedValue({ data: [mockMember] });
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useCommunityMembersQuery('c1'), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockGetMembers).toHaveBeenCalledWith('c1');
  });
});

describe('useCheckIdentifierQuery', () => {
  it('is disabled for empty identifier', () => {
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useCheckIdentifierQuery(''), { wrapper });
    expect(result.current.fetchStatus).toBe('idle');
  });

  it('checks identifier when non-empty', async () => {
    mockCheckIdentifier.mockResolvedValue({ data: { available: true } });
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useCheckIdentifierQuery('devs'), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockCheckIdentifier).toHaveBeenCalledWith('devs');
  });
});

describe('useCreateCommunityMutation', () => {
  it('calls createCommunity and invalidates lists on success', async () => {
    mockCreateCommunity.mockResolvedValue({ data: mockCommunity });
    const { wrapper, queryClient } = makeWrapper();
    const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

    const { result } = renderHook(() => useCreateCommunityMutation(), { wrapper });
    await act(async () => {
      result.current.mutate({ name: 'New' } as Parameters<typeof result.current.mutate>[0]);
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(invalidateSpy).toHaveBeenCalled();
  });
});

describe('useUpdateCommunityMutation', () => {
  it('calls updateCommunity and invalidates on success', async () => {
    mockUpdateCommunity.mockResolvedValue({ data: mockCommunity });
    const { wrapper, queryClient } = makeWrapper();
    const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

    const { result } = renderHook(() => useUpdateCommunityMutation(), { wrapper });
    await act(async () => {
      result.current.mutate({ id: 'c1', data: { name: 'Updated' } } as Parameters<typeof result.current.mutate>[0]);
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(invalidateSpy).toHaveBeenCalled();
  });
});

describe('useDeleteCommunityMutation', () => {
  it('calls deleteCommunity and removes from cache on success', async () => {
    mockDeleteCommunity.mockResolvedValue({});
    const { wrapper, queryClient } = makeWrapper();
    const removeSpy = jest.spyOn(queryClient, 'removeQueries');

    const { result } = renderHook(() => useDeleteCommunityMutation(), { wrapper });
    await act(async () => { result.current.mutate('c1'); });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(removeSpy).toHaveBeenCalled();
  });
});

describe('useJoinCommunityMutation', () => {
  it('calls joinCommunity on success', async () => {
    mockJoinCommunity.mockResolvedValue({});
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useJoinCommunityMutation(), { wrapper });
    await act(async () => { result.current.mutate('c1'); });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockJoinCommunity).toHaveBeenCalledWith('c1');
  });
});

describe('useLeaveCommunityMutation', () => {
  it('calls leaveCommunity on success', async () => {
    mockLeaveCommunity.mockResolvedValue({});
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useLeaveCommunityMutation(), { wrapper });
    await act(async () => { result.current.mutate('c1'); });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockLeaveCommunity).toHaveBeenCalledWith('c1');
  });
});

describe('useAddMemberMutation', () => {
  it('calls addMember and invalidates on success', async () => {
    mockAddMember.mockResolvedValue({ data: mockMember });
    const { wrapper, queryClient } = makeWrapper();
    const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

    const { result } = renderHook(() => useAddMemberMutation(), { wrapper });
    await act(async () => {
      result.current.mutate({ communityId: 'c1', data: { userId: 'u1' } } as Parameters<typeof result.current.mutate>[0]);
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(invalidateSpy).toHaveBeenCalled();
  });
});

describe('useRemoveMemberMutation', () => {
  it('calls removeMember and invalidates on success', async () => {
    mockRemoveMember.mockResolvedValue({});
    const { wrapper, queryClient } = makeWrapper();
    const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

    const { result } = renderHook(() => useRemoveMemberMutation(), { wrapper });
    await act(async () => {
      result.current.mutate({ communityId: 'c1', memberId: 'm1' });
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(invalidateSpy).toHaveBeenCalled();
  });
});

describe('useUpdateMemberRoleMutation', () => {
  it('calls updateMemberRole and invalidates on success', async () => {
    mockUpdateMemberRole.mockResolvedValue({});
    const { wrapper, queryClient } = makeWrapper();
    const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

    const { result } = renderHook(() => useUpdateMemberRoleMutation(), { wrapper });
    await act(async () => {
      result.current.mutate({ communityId: 'c1', memberId: 'm1', data: { role: 'ADMIN' } } as Parameters<typeof result.current.mutate>[0]);
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(invalidateSpy).toHaveBeenCalled();
  });
});

// ─── useCommunityPreferencesQuery ─────────────────────────────────────────────

describe('useCommunityPreferencesQuery', () => {
  it('is disabled when communityId is null', () => {
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useCommunityPreferencesQuery(null), { wrapper });
    expect(result.current.fetchStatus).toBe('idle');
  });

  it('fetches preferences for a community', async () => {
    const prefs = { communityId: 'c1', notifications: true };
    mockGetPreferences.mockResolvedValue({ data: prefs });
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useCommunityPreferencesQuery('c1'), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockGetPreferences).toHaveBeenCalledWith('c1');
    expect(result.current.data).toEqual(prefs);
  });
});

describe('useCommunityPreferencesListQuery', () => {
  it('fetches list of all preferences', async () => {
    const prefList = [{ communityId: 'c1' }, { communityId: 'c2' }];
    mockListPreferences.mockResolvedValue({ data: prefList });
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useCommunityPreferencesListQuery(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(prefList);
  });
});

describe('useUpdateCommunityPreferencesMutation', () => {
  it('calls updatePreferences and invalidates on success', async () => {
    mockUpdatePreferences.mockResolvedValue({});
    const { wrapper, queryClient } = makeWrapper();
    const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

    const { result } = renderHook(() => useUpdateCommunityPreferencesMutation(), { wrapper });
    await act(async () => {
      result.current.mutate({ communityId: 'c1', data: { notifications: false } } as Parameters<typeof result.current.mutate>[0]);
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(invalidateSpy).toHaveBeenCalled();
  });
});

describe('useDeleteCommunityPreferencesMutation', () => {
  it('calls deletePreferences and invalidates on success', async () => {
    mockDeletePreferences.mockResolvedValue({});
    const { wrapper, queryClient } = makeWrapper();
    const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

    const { result } = renderHook(() => useDeleteCommunityPreferencesMutation(), { wrapper });
    await act(async () => { result.current.mutate('c1'); });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(invalidateSpy).toHaveBeenCalled();
  });
});

describe('useReorderCommunitiesMutation', () => {
  it('calls reorderPreferences and invalidates list on success', async () => {
    mockReorderPreferences.mockResolvedValue({});
    const { wrapper, queryClient } = makeWrapper();
    const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

    const { result } = renderHook(() => useReorderCommunitiesMutation(), { wrapper });
    await act(async () => {
      result.current.mutate([{ communityId: 'c1', orderInCategory: 0 }]);
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(invalidateSpy).toHaveBeenCalled();
  });
});
