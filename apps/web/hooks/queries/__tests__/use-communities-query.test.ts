import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import type { Community, CommunityMember, Conversation } from '@meeshy/shared/types';

jest.mock('@/services/communities.service', () => ({
  communitiesService: {
    getCommunities: jest.fn(),
    getCommunity: jest.fn(),
    searchCommunities: jest.fn(),
    getCommunityConversations: jest.fn(),
    getMembers: jest.fn(),
    checkIdentifier: jest.fn(),
    createCommunity: jest.fn(),
    updateCommunity: jest.fn(),
    deleteCommunity: jest.fn(),
    joinCommunity: jest.fn(),
    leaveCommunity: jest.fn(),
    addMember: jest.fn(),
    removeMember: jest.fn(),
    updateMemberRole: jest.fn(),
  },
}));

import { communitiesService } from '@/services/communities.service';

const mockService = communitiesService as jest.Mocked<typeof communitiesService>;

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
} from '../use-communities-query';

function makeCommunity(overrides: Partial<Community> & { id: string }): Community {
  return {
    identifier: 'mshy_test',
    name: 'Test Community',
    isPrivate: false,
    createdBy: 'user-1',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as Community;
}

function makeMember(overrides: Partial<CommunityMember> & { id: string }): CommunityMember {
  return {
    communityId: 'comm-1',
    userId: 'user-1',
    role: 'member' as const,
    joinedAt: new Date(),
    ...overrides,
  } as CommunityMember;
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

describe('useCommunitiesQuery', () => {
  it('fetches communities list', async () => {
    const communities = [makeCommunity({ id: 'c1' }), makeCommunity({ id: 'c2', name: 'Second' })];
    mockService.getCommunities.mockResolvedValue({
      success: true,
      data: communities,
    });

    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useCommunitiesQuery(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(communities);
    expect(mockService.getCommunities).toHaveBeenCalledWith({ search: undefined });
  });

  it('passes search filter', async () => {
    mockService.getCommunities.mockResolvedValue({ success: true, data: [] });

    const { wrapper } = createWrapper();
    renderHook(() => useCommunitiesQuery({ search: 'test' }), { wrapper });

    await waitFor(() =>
      expect(mockService.getCommunities).toHaveBeenCalledWith({ search: 'test' })
    );
  });

  it('respects enabled option', () => {
    const { wrapper } = createWrapper();
    renderHook(() => useCommunitiesQuery({ enabled: false }), { wrapper });

    expect(mockService.getCommunities).not.toHaveBeenCalled();
  });
});

describe('useCommunityQuery', () => {
  it('fetches single community by id', async () => {
    const community = makeCommunity({ id: 'c1' });
    mockService.getCommunity.mockResolvedValue({ success: true, data: community });

    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useCommunityQuery('c1'), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(community);
  });

  it('is disabled when id is null', () => {
    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useCommunityQuery(null), { wrapper });

    expect(result.current.isFetching).toBe(false);
    expect(mockService.getCommunity).not.toHaveBeenCalled();
  });
});

describe('useCommunitySearchQuery', () => {
  it('searches communities with query', async () => {
    const results = [makeCommunity({ id: 'c1', name: 'Found' })];
    mockService.searchCommunities.mockResolvedValue({ success: true, data: results });

    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useCommunitySearchQuery('Found'), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(results);
    expect(mockService.searchCommunities).toHaveBeenCalledWith('Found', 0, 20);
  });

  it('is disabled for short queries', () => {
    const { wrapper } = createWrapper();
    renderHook(() => useCommunitySearchQuery('a'), { wrapper });

    expect(mockService.searchCommunities).not.toHaveBeenCalled();
  });
});

describe('useCommunityConversationsQuery', () => {
  it('fetches conversations for a community', async () => {
    const convos = [{ id: 'conv-1' }] as Conversation[];
    mockService.getCommunityConversations.mockResolvedValue({
      success: true,
      data: convos,
    });

    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useCommunityConversationsQuery('c1'), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(convos);
  });
});

describe('useCommunityMembersQuery', () => {
  it('fetches members for a community', async () => {
    const members = [makeMember({ id: 'm1' })];
    mockService.getMembers.mockResolvedValue({ success: true, data: members });

    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useCommunityMembersQuery('c1'), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(members);
  });
});

describe('useCheckIdentifierQuery', () => {
  it('checks identifier availability', async () => {
    mockService.checkIdentifier.mockResolvedValue({
      success: true,
      data: { available: true, identifier: 'mshy_test' },
    });

    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useCheckIdentifierQuery('mshy_test'), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.available).toBe(true);
  });

  it('is disabled for empty identifier', () => {
    const { wrapper } = createWrapper();
    renderHook(() => useCheckIdentifierQuery(''), { wrapper });

    expect(mockService.checkIdentifier).not.toHaveBeenCalled();
  });
});

describe('useCreateCommunityMutation', () => {
  it('creates community and invalidates list cache', async () => {
    const newCommunity = makeCommunity({ id: 'c-new', name: 'New' });
    mockService.createCommunity.mockResolvedValue({
      success: true,
      data: newCommunity,
    });

    const { wrapper, queryClient } = createWrapper();
    const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

    const { result } = renderHook(() => useCreateCommunityMutation(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({ name: 'New' });
    });

    expect(mockService.createCommunity).toHaveBeenCalledWith({ name: 'New' });
    expect(invalidateSpy).toHaveBeenCalled();
  });
});

describe('useUpdateCommunityMutation', () => {
  it('updates community and invalidates caches', async () => {
    const updated = makeCommunity({ id: 'c1', name: 'Updated' });
    mockService.updateCommunity.mockResolvedValue({ success: true, data: updated });

    const { wrapper, queryClient } = createWrapper();
    const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

    const { result } = renderHook(() => useUpdateCommunityMutation(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({ id: 'c1', data: { name: 'Updated' } });
    });

    expect(mockService.updateCommunity).toHaveBeenCalledWith('c1', { name: 'Updated' });
    expect(invalidateSpy).toHaveBeenCalled();
  });
});

describe('useDeleteCommunityMutation', () => {
  it('deletes community and invalidates list', async () => {
    mockService.deleteCommunity.mockResolvedValue({ success: true });

    const { wrapper, queryClient } = createWrapper();
    const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

    const { result } = renderHook(() => useDeleteCommunityMutation(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync('c1');
    });

    expect(mockService.deleteCommunity).toHaveBeenCalledWith('c1');
    expect(invalidateSpy).toHaveBeenCalled();
  });
});

describe('useJoinCommunityMutation', () => {
  it('joins community and invalidates caches', async () => {
    const member = makeMember({ id: 'm1' });
    mockService.joinCommunity.mockResolvedValue({ success: true, data: member });

    const { wrapper, queryClient } = createWrapper();
    const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

    const { result } = renderHook(() => useJoinCommunityMutation(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync('c1');
    });

    expect(mockService.joinCommunity).toHaveBeenCalledWith('c1');
    expect(invalidateSpy).toHaveBeenCalled();
  });
});

describe('useLeaveCommunityMutation', () => {
  it('leaves community and invalidates caches', async () => {
    mockService.leaveCommunity.mockResolvedValue({ success: true });

    const { wrapper, queryClient } = createWrapper();
    const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

    const { result } = renderHook(() => useLeaveCommunityMutation(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync('c1');
    });

    expect(mockService.leaveCommunity).toHaveBeenCalledWith('c1');
    expect(invalidateSpy).toHaveBeenCalled();
  });
});

describe('useAddMemberMutation', () => {
  it('adds member and invalidates members cache', async () => {
    const member = makeMember({ id: 'm-new' });
    mockService.addMember.mockResolvedValue({ success: true, data: member });

    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useAddMemberMutation(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({ communityId: 'c1', data: { userId: 'u1' } });
    });

    expect(mockService.addMember).toHaveBeenCalledWith('c1', { userId: 'u1' });
  });
});

describe('useRemoveMemberMutation', () => {
  it('removes member and invalidates caches', async () => {
    mockService.removeMember.mockResolvedValue({ success: true });

    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useRemoveMemberMutation(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({ communityId: 'c1', memberId: 'm1' });
    });

    expect(mockService.removeMember).toHaveBeenCalledWith('c1', 'm1');
  });
});

describe('useUpdateMemberRoleMutation', () => {
  it('updates member role', async () => {
    const updated = makeMember({ id: 'm1', role: 'admin' as never });
    mockService.updateMemberRole.mockResolvedValue({ success: true, data: updated });

    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useUpdateMemberRoleMutation(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({
        communityId: 'c1',
        memberId: 'm1',
        data: { role: 'admin' as never },
      });
    });

    expect(mockService.updateMemberRole).toHaveBeenCalledWith('c1', 'm1', {
      role: 'admin',
    });
  });
});
