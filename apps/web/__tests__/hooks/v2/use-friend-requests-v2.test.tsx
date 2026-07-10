import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { useFriendRequestsV2 } from '@/hooks/v2/use-friend-requests-v2';
import type { FriendRequest } from '@/types/contacts';

const mockGet = jest.fn();
const mockPost = jest.fn();
const mockPatch = jest.fn();
const mockDelete = jest.fn();

jest.mock('@/services/api.service', () => ({
  apiService: {
    get: (...args: unknown[]) => mockGet(...args),
    post: (...args: unknown[]) => mockPost(...args),
    patch: (...args: unknown[]) => mockPatch(...args),
    delete: (...args: unknown[]) => mockDelete(...args),
  },
}));

jest.mock('@/hooks/use-websocket', () => ({
  useWebSocket: () => ({ isConnected: true }),
}));

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
};

const makeFriendRequest = (overrides: Partial<FriendRequest> = {}): FriendRequest => ({
  id: 'req1',
  senderId: 'user1',
  receiverId: 'user2',
  status: 'pending',
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
  ...overrides,
});

describe('useFriendRequestsV2', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGet.mockResolvedValue({ data: { success: true, data: [], pagination: { total: 0 } } });
  });

  it('fetches received and sent requests on mount', async () => {
    const receivedRequests = [makeFriendRequest({ id: 'r1', status: 'pending' })];
    const sentRequests = [makeFriendRequest({ id: 's1', senderId: 'me', receiverId: 'other' })];

    mockGet
      .mockResolvedValueOnce({ data: { success: true, data: receivedRequests, pagination: { total: 1 } } })
      .mockResolvedValueOnce({ data: { success: true, data: sentRequests, pagination: { total: 1 } } });

    const { result } = renderHook(() => useFriendRequestsV2(), { wrapper: createWrapper() });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(mockGet).toHaveBeenCalledWith('/friend-requests/received', { offset: '0', limit: '100' });
    expect(mockGet).toHaveBeenCalledWith('/friend-requests/sent', { offset: '0', limit: '100' });
  });

  it('separates requests by status', async () => {
    const requests = [
      makeFriendRequest({ id: 'r1', status: 'pending' }),
      makeFriendRequest({ id: 'r2', status: 'accepted' }),
      makeFriendRequest({ id: 'r3', status: 'rejected' }),
    ];

    mockGet
      .mockResolvedValueOnce({ data: { success: true, data: requests.filter(r => r.status === 'pending'), pagination: { total: 1 } } })
      .mockResolvedValueOnce({ data: { success: true, data: requests, pagination: { total: 3 } } });

    const { result } = renderHook(() => useFriendRequestsV2(), { wrapper: createWrapper() });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.pending.length).toBeGreaterThanOrEqual(1);
    expect(result.current.connected.length).toBeGreaterThanOrEqual(1);
    expect(result.current.refused.length).toBeGreaterThanOrEqual(1);
  });

  it('computes stats from all requests', async () => {
    const received = [makeFriendRequest({ id: 'r1', status: 'pending' })];
    const sent = [
      makeFriendRequest({ id: 's1', status: 'accepted' }),
      makeFriendRequest({ id: 's2', status: 'rejected' }),
    ];

    mockGet
      .mockResolvedValueOnce({ data: { success: true, data: received, pagination: { total: 1 } } })
      .mockResolvedValueOnce({ data: { success: true, data: sent, pagination: { total: 2 } } });

    const { result } = renderHook(() => useFriendRequestsV2(), { wrapper: createWrapper() });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.stats.pending).toBe(1);
    expect(result.current.stats.connected).toBe(1);
    expect(result.current.stats.refused).toBe(1);
  });

  it('sends a friend request via mutation', async () => {
    mockGet.mockResolvedValue({ data: { success: true, data: [], pagination: { total: 0 } } });
    mockPost.mockResolvedValue({ data: { success: true, data: makeFriendRequest() } });

    const { result } = renderHook(() => useFriendRequestsV2(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.sendRequest('targetUserId');
    });

    expect(mockPost).toHaveBeenCalledWith('/friend-requests', { receiverId: 'targetUserId' });
  });

  it('accepts a friend request via mutation', async () => {
    mockGet.mockResolvedValue({ data: { success: true, data: [], pagination: { total: 0 } } });
    mockPatch.mockResolvedValue({ data: { success: true, data: makeFriendRequest({ status: 'accepted' }) } });

    const { result } = renderHook(() => useFriendRequestsV2(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.acceptRequest('req1');
    });

    expect(mockPatch).toHaveBeenCalledWith('/friend-requests/req1', { status: 'accepted' });
  });

  it('rejects a friend request via mutation', async () => {
    mockGet.mockResolvedValue({ data: { success: true, data: [], pagination: { total: 0 } } });
    mockPatch.mockResolvedValue({ data: { success: true, data: makeFriendRequest({ status: 'rejected' }) } });

    const { result } = renderHook(() => useFriendRequestsV2(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.rejectRequest('req1');
    });

    expect(mockPatch).toHaveBeenCalledWith('/friend-requests/req1', { status: 'rejected' });
  });

  it('cancels a friend request via mutation', async () => {
    mockGet.mockResolvedValue({ data: { success: true, data: [], pagination: { total: 0 } } });
    mockDelete.mockResolvedValue({ data: { success: true } });

    const { result } = renderHook(() => useFriendRequestsV2(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.cancelRequest('req1');
    });

    expect(mockDelete).toHaveBeenCalledWith('/friend-requests/req1');
  });

  it('provides getPendingRequestWithUser helper', async () => {
    const received = [makeFriendRequest({ id: 'r1', status: 'pending', senderId: 'userA', receiverId: 'me' })];
    const sent = [makeFriendRequest({ id: 's1', status: 'pending', senderId: 'me', receiverId: 'userB' })];

    mockGet
      .mockResolvedValueOnce({ data: { success: true, data: received, pagination: { total: 1 } } })
      .mockResolvedValueOnce({ data: { success: true, data: sent, pagination: { total: 1 } } });

    const { result } = renderHook(() => useFriendRequestsV2({ currentUserId: 'me' }), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.getPendingRequestWithUser('userA')).toBeDefined();
    expect(result.current.getPendingRequestWithUser('userB')).toBeDefined();
    expect(result.current.getPendingRequestWithUser('unknown')).toBeUndefined();
  });

  it('handles fetch errors gracefully', async () => {
    mockGet.mockRejectedValue(new Error('Network error'));

    const { result } = renderHook(() => useFriendRequestsV2(), { wrapper: createWrapper() });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.error).toBeTruthy();
  });
});
