'use client';

import { useCallback, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiService } from '@/services/api.service';
import { queryKeys } from '@/lib/react-query/query-keys';
import type { FriendRequest, FriendRequestsData } from '@/types/contacts';

export interface UseFriendRequestsV2Options {
  enabled?: boolean;
  currentUserId?: string;
}

export interface FriendRequestsStats {
  connected: number;
  pending: number;
  refused: number;
}

export interface UseFriendRequestsV2Return {
  received: FriendRequest[];
  sent: FriendRequest[];
  connected: FriendRequest[];
  pending: FriendRequest[];
  refused: FriendRequest[];
  allRequests: FriendRequest[];
  stats: FriendRequestsStats;
  isLoading: boolean;
  error: string | null;
  sendRequest: (receiverId: string, message?: string) => Promise<void>;
  acceptRequest: (requestId: string) => Promise<void>;
  rejectRequest: (requestId: string) => Promise<void>;
  cancelRequest: (requestId: string) => Promise<void>;
  getPendingRequestWithUser: (userId: string) => FriendRequest | undefined;
  refresh: () => Promise<void>;
}

function extractRequests(response: unknown): FriendRequest[] {
  if (!response || typeof response !== 'object') return [];
  const outer = (response as Record<string, unknown>).data;
  if (!outer || typeof outer !== 'object') return [];
  const inner = (outer as Record<string, unknown>).data;
  return Array.isArray(inner) ? inner : [];
}

export function useFriendRequestsV2(
  options: UseFriendRequestsV2Options = {}
): UseFriendRequestsV2Return {
  const { enabled = true, currentUserId } = options;
  const queryClient = useQueryClient();

  const receivedQueryKey = queryKeys.friendRequests.received();
  const sentQueryKey = queryKeys.friendRequests.sent();

  const {
    data: receivedData,
    isLoading: isLoadingReceived,
    error: receivedError,
  } = useQuery({
    queryKey: receivedQueryKey,
    queryFn: async () => {
      const response = await apiService.get<{
        success: boolean;
        data: FriendRequest[];
        pagination: { total: number };
      }>('/friend-requests/received', { offset: '0', limit: '100' });
      return extractRequests(response);
    },
    enabled,
    refetchInterval: 30000,
  });

  const {
    data: sentData,
    isLoading: isLoadingSent,
    error: sentError,
  } = useQuery({
    queryKey: sentQueryKey,
    queryFn: async () => {
      const response = await apiService.get<{
        success: boolean;
        data: FriendRequest[];
        pagination: { total: number };
      }>('/friend-requests/sent', { offset: '0', limit: '100' });
      return extractRequests(response);
    },
    enabled,
    refetchInterval: 30000,
  });

  const received = useMemo(() => receivedData ?? [], [receivedData]);
  const sent = useMemo(() => sentData ?? [], [sentData]);
  const allRequests = useMemo(() => [...received, ...sent], [received, sent]);

  const { connected, pending, refused } = useMemo<FriendRequestsData>(() => {
    const connectedArr: FriendRequest[] = [];
    const pendingArr: FriendRequest[] = [];
    const refusedArr: FriendRequest[] = [];

    for (const req of allRequests) {
      switch (req.status) {
        case 'accepted':
          connectedArr.push(req);
          break;
        case 'pending':
          pendingArr.push(req);
          break;
        case 'rejected':
          refusedArr.push(req);
          break;
      }
    }

    return { received, sent, connected: connectedArr, pending: pendingArr, refused: refusedArr };
  }, [allRequests, received, sent]);

  const stats = useMemo<FriendRequestsStats>(
    () => ({ connected: connected.length, pending: pending.length, refused: refused.length }),
    [connected, pending, refused]
  );

  const invalidateAll = useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: receivedQueryKey }),
      queryClient.invalidateQueries({ queryKey: sentQueryKey }),
    ]);
  }, [queryClient, receivedQueryKey, sentQueryKey]);

  const sendMutation = useMutation({
    mutationFn: async ({ receiverId, message }: { receiverId: string; message?: string }) => {
      await apiService.post('/friend-requests', { receiverId, ...(message && { message }) });
    },
    onMutate: async ({ receiverId }) => {
      if (!currentUserId) return {};
      await queryClient.cancelQueries({ queryKey: sentQueryKey });
      const previous = queryClient.getQueryData<FriendRequest[]>(sentQueryKey);
      const now = new Date().toISOString();
      const optimistic: FriendRequest = {
        id: `optimistic-${Date.now()}`,
        senderId: currentUserId,
        receiverId,
        status: 'pending',
        createdAt: now,
        updatedAt: now,
      };
      queryClient.setQueryData<FriendRequest[]>(sentQueryKey, (old) => [...(old ?? []), optimistic]);
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(sentQueryKey, context.previous);
    },
    onSettled: () => invalidateAll(),
  });

  const acceptMutation = useMutation({
    mutationFn: async (requestId: string) => {
      await apiService.patch(`/friend-requests/${requestId}`, { status: 'accepted' });
    },
    onMutate: async (requestId) => {
      await queryClient.cancelQueries({ queryKey: receivedQueryKey });
      const previous = queryClient.getQueryData<FriendRequest[]>(receivedQueryKey);
      queryClient.setQueryData<FriendRequest[]>(receivedQueryKey, (old) =>
        (old ?? []).map((r) => (r.id === requestId ? { ...r, status: 'accepted' as const } : r))
      );
      return { previous };
    },
    onError: (_err, _id, context) => {
      if (context?.previous) queryClient.setQueryData(receivedQueryKey, context.previous);
    },
    onSettled: () => invalidateAll(),
  });

  const rejectMutation = useMutation({
    mutationFn: async (requestId: string) => {
      await apiService.patch(`/friend-requests/${requestId}`, { status: 'rejected' });
    },
    onMutate: async (requestId) => {
      await queryClient.cancelQueries({ queryKey: receivedQueryKey });
      const previous = queryClient.getQueryData<FriendRequest[]>(receivedQueryKey);
      queryClient.setQueryData<FriendRequest[]>(receivedQueryKey, (old) =>
        (old ?? []).map((r) => (r.id === requestId ? { ...r, status: 'rejected' as const } : r))
      );
      return { previous };
    },
    onError: (_err, _id, context) => {
      if (context?.previous) queryClient.setQueryData(receivedQueryKey, context.previous);
    },
    onSettled: () => invalidateAll(),
  });

  const cancelMutation = useMutation({
    mutationFn: async (requestId: string) => {
      await apiService.delete(`/friend-requests/${requestId}`);
    },
    onMutate: async (requestId) => {
      await queryClient.cancelQueries({ queryKey: sentQueryKey });
      const previousSent = queryClient.getQueryData<FriendRequest[]>(sentQueryKey);
      await queryClient.cancelQueries({ queryKey: receivedQueryKey });
      const previousReceived = queryClient.getQueryData<FriendRequest[]>(receivedQueryKey);
      queryClient.setQueryData<FriendRequest[]>(sentQueryKey, (old) =>
        (old ?? []).filter((r) => r.id !== requestId)
      );
      queryClient.setQueryData<FriendRequest[]>(receivedQueryKey, (old) =>
        (old ?? []).filter((r) => r.id !== requestId)
      );
      return { previousSent, previousReceived };
    },
    onError: (_err, _id, context) => {
      if (context?.previousSent) queryClient.setQueryData(sentQueryKey, context.previousSent);
      if (context?.previousReceived) queryClient.setQueryData(receivedQueryKey, context.previousReceived);
    },
    onSettled: () => invalidateAll(),
  });

  const sendRequest = useCallback(
    async (receiverId: string, message?: string) => {
      await sendMutation.mutateAsync({ receiverId, message });
    },
    [sendMutation]
  );

  const acceptRequest = useCallback(
    async (requestId: string) => {
      await acceptMutation.mutateAsync(requestId);
    },
    [acceptMutation]
  );

  const rejectRequest = useCallback(
    async (requestId: string) => {
      await rejectMutation.mutateAsync(requestId);
    },
    [rejectMutation]
  );

  const cancelRequest = useCallback(
    async (requestId: string) => {
      await cancelMutation.mutateAsync(requestId);
    },
    [cancelMutation]
  );

  const getPendingRequestWithUser = useCallback(
    (userId: string): FriendRequest | undefined => {
      return pending.find(
        (req) =>
          (req.senderId === userId || req.receiverId === userId) &&
          (currentUserId
            ? req.senderId === currentUserId || req.receiverId === currentUserId
            : true)
      );
    },
    [pending, currentUserId]
  );

  return {
    received,
    sent,
    connected,
    pending,
    refused,
    allRequests,
    stats,
    isLoading: isLoadingReceived || isLoadingSent,
    error: receivedError?.message ?? sentError?.message ?? null,
    sendRequest,
    acceptRequest,
    rejectRequest,
    cancelRequest,
    getPendingRequestWithUser,
    refresh: invalidateAll,
  };
}
