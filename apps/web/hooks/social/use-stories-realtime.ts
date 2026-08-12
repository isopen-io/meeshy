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
  StoryDeletedEventData,
} from '@meeshy/shared/types/post';
import type { StoryTranslationUpdatedEventData } from '@meeshy/shared/types/socketio-events';

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

  // W4 — une story supprimée disparaît du tray en direct (avant : elle
  // restait affichée jusqu'au refetch et son ouverture échouait).
  const onStoryDeleted = useCallback(
    (data: StoryDeletedEventData) => {
      queryClient.setQueryData<Post[]>(queryKeys.stories.feed(), (old) =>
        old?.filter((s) => s.id !== data.storyId)
      );
    },
    [queryClient]
  );

  // W4 — les traductions Prisme arrivées après coup se fusionnent en direct,
  // PAR TEXT-OBJECT (payload { postId, textObjectIndex, translations } —
  // parité iOS withTextObjectTranslationsMerged). Les langues existantes de
  // l'objet sont écrasées, les nouvelles ajoutées ; index hors borne → no-op.
  const onStoryTranslationUpdated = useCallback(
    (data: StoryTranslationUpdatedEventData) => {
      queryClient.setQueryData<Post[]>(queryKeys.stories.feed(), (old) =>
        old?.map((s) => {
          if (s.id !== data.postId) return s;
          const textObjects = s.storyEffects?.textObjects;
          if (!textObjects || !textObjects[data.textObjectIndex]) return s;
          const merged = textObjects.map((t, i) =>
            i === data.textObjectIndex
              ? { ...t, translations: { ...t.translations, ...data.translations } }
              : t
          );
          return { ...s, storyEffects: { ...s.storyEffects, textObjects: merged } };
        })
      );
    },
    [queryClient]
  );

  useSocialSocket({
    onStoryCreated,
    onStoryViewed,
    onStoryReacted,
    onStoryDeleted,
    onStoryTranslationUpdated,
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
