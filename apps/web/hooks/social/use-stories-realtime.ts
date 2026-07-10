'use client';

import { useState, useCallback, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/react-query/query-keys';
import { useSocialSocket } from './use-social-socket';
import type { Post } from '@meeshy/shared/types/post';
import type {
  StoryCreatedEventData,
  StoryViewedEventData,
  StoryReactedEventData,
} from '@meeshy/shared/types/post';

// ============================================================================
// Types
// ============================================================================

interface UseStoriesRealtimeOptions {
  enabled?: boolean;
}

interface UseStoriesRealtimeReturn {
  readonly newStoriesCount: number;
  readonly clearNewStories: () => void;
}

// ============================================================================
// Hook
// ============================================================================

export function useStoriesRealtime(
  options: UseStoriesRealtimeOptions = {}
): UseStoriesRealtimeReturn {
  const { enabled = true } = options;
  const queryClient = useQueryClient();
  const [newStoriesCount, setNewStoriesCount] = useState(0);

  const onStoryCreated = useCallback(
    (data: StoryCreatedEventData) => {
      queryClient.setQueryData<Post[]>(queryKeys.stories.feed(), (old) => {
        if (!old) return [data.story];
        const exists = old.some(s => s.id === data.story.id);
        if (exists) return old;
        return [data.story, ...old];
      });
      setNewStoriesCount(prev => prev + 1);
    },
    [queryClient]
  );

  const onStoryViewed = useCallback(
    (data: StoryViewedEventData) => {
      queryClient.setQueryData<Post[]>(queryKeys.stories.feed(), (old) => {
        if (!old) return old;
        return old.map(s =>
          s.id === data.storyId ? { ...s, viewCount: data.viewCount } : s
        );
      });
    },
    [queryClient]
  );

  const onStoryReacted = useCallback(
    (_data: StoryReactedEventData) => {
      // Reaction events are informational for the story author
      // No cache mutation needed on the feed query
    },
    []
  );

  useSocialSocket({
    onStoryCreated,
    onStoryViewed,
    onStoryReacted,
    enabled,
  });

  const clearNewStories = useCallback(() => {
    setNewStoriesCount(0);
  }, []);

  return useMemo(
    () => ({ newStoriesCount, clearNewStories }),
    [newStoriesCount, clearNewStories]
  );
}
