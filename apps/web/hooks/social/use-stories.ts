'use client';

import { useRef, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/react-query/query-keys';
import { storyService } from '@/services/story.service';
import { useAuthStore } from '@/stores/auth-store';
import type { Post, PostVisibility } from '@meeshy/shared/types/post';
import type { CreateStoryRequest } from '@/services/story.service';

// ============================================================================
// useStoriesFeedQuery
// ============================================================================

interface UseStoriesFeedOptions {
  enabled?: boolean;
}

export function useStoriesFeedQuery(options: UseStoriesFeedOptions = {}) {
  const { enabled = true } = options;
  const token = useAuthStore(s => s.authToken);

  return useQuery({
    queryKey: queryKeys.stories.feed(),
    queryFn: () => storyService.getStories(),
    staleTime: Infinity,
    gcTime: 30 * 60 * 1000,
    refetchOnWindowFocus: 'always' as const,
    enabled: enabled && !!token,
  });
}

// ============================================================================
// useCreateStoryMutation
// ============================================================================

export function useCreateStoryMutation() {
  const queryClient = useQueryClient();
  const currentUser = useAuthStore(s => s.user);

  return useMutation({
    mutationFn: (data: CreateStoryRequest) => storyService.createStory(data),
    onMutate: async (newStory) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.stories.feed() });

      const previousStories = queryClient.getQueryData<Post[]>(queryKeys.stories.feed());

      const optimisticStory: Post = {
        id: `_optimistic_${Date.now()}`,
        authorId: currentUser?.id ?? '',
        type: 'STORY',
        visibility: (newStory.visibility ?? 'FRIENDS') as PostVisibility,
        content: newStory.content ?? null,
        storyEffects: newStory.storyEffects,
        originalLanguage: newStory.originalLanguage ?? null,
        likeCount: 0,
        commentCount: 0,
        repostCount: 0,
        viewCount: 0,
        bookmarkCount: 0,
        shareCount: 0,
        isPinned: false,
        isEdited: false,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        author: currentUser ? {
          id: currentUser.id,
          username: currentUser.username,
          displayName: currentUser.displayName ?? null,
          avatar: currentUser.avatar ?? null,
        } : undefined,
      };

      queryClient.setQueryData<Post[]>(queryKeys.stories.feed(), (old) => {
        return [optimisticStory, ...(old ?? [])];
      });

      return { previousStories };
    },
    onSuccess: (serverStory) => {
      queryClient.setQueryData<Post[]>(queryKeys.stories.feed(), (old) => {
        if (!old) return [serverStory];
        return old.map(s => s.id.startsWith('_optimistic_') ? serverStory : s);
      });
    },
    onError: (_err, _vars, context) => {
      if (context?.previousStories) {
        queryClient.setQueryData(queryKeys.stories.feed(), context.previousStories);
      }
    },
  });
}

// ============================================================================
// useDeleteStoryMutation
// ============================================================================

export function useDeleteStoryMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (storyId: string) => storyService.deleteStory(storyId),
    onMutate: async (storyId) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.stories.feed() });

      const previousStories = queryClient.getQueryData<Post[]>(queryKeys.stories.feed());

      queryClient.setQueryData<Post[]>(queryKeys.stories.feed(), (old) => {
        return (old ?? []).filter(s => s.id !== storyId);
      });

      return { previousStories };
    },
    onError: (_err, _vars, context) => {
      if (context?.previousStories) {
        queryClient.setQueryData(queryKeys.stories.feed(), context.previousStories);
      }
    },
  });
}

// ============================================================================
// useRecordStoryViewMutation
// ============================================================================

export function useRecordStoryViewMutation() {
  const viewedRef = useRef<Set<string>>(new Set());

  const mutation = useMutation({
    mutationFn: (storyId: string) => storyService.recordView(storyId),
  });

  const recordView = useCallback((storyId: string) => {
    if (viewedRef.current.has(storyId)) return;
    viewedRef.current.add(storyId);
    mutation.mutate(storyId);
  }, [mutation]);

  return { recordView };
}

// ============================================================================
// useReactToStoryMutation
// ============================================================================

export function useReactToStoryMutation() {
  return useMutation({
    mutationFn: ({ storyId, emoji }: { storyId: string; emoji: string }) =>
      storyService.reactToStory(storyId, emoji),
  });
}
