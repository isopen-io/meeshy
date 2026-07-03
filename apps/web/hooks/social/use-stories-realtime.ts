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

// `Post.storyEffects` is typed `unknown` in the shared package; these minimal
// shapes let us narrow the parts we mutate without asserting the whole object.
type StoryTextObjectShape = {
  translations?: Record<string, string>;
  [key: string]: unknown;
};
type StoryEffectsShape = {
  textObjects?: StoryTextObjectShape[];
  [key: string]: unknown;
};

/**
 * Immutably merges the newly-translated languages into
 * `storyEffects.textObjects[index].translations`. Returns the SAME reference
 * when there is nothing to merge (unknown/malformed effects, missing
 * `textObjects`, or an out-of-range index) so callers can skip re-renders.
 */
export function mergeStoryTextObjectTranslations(
  storyEffects: unknown,
  textObjectIndex: number,
  translations: Record<string, string>,
): unknown {
  if (!storyEffects || typeof storyEffects !== 'object') return storyEffects;
  const effects = storyEffects as StoryEffectsShape;
  const textObjects = effects.textObjects;
  if (!Array.isArray(textObjects)) return storyEffects;
  const target = textObjects[textObjectIndex];
  if (!target || typeof target !== 'object') return storyEffects;

  const nextTextObjects = textObjects.map((obj, i) =>
    i === textObjectIndex
      ? { ...obj, translations: { ...(obj.translations ?? {}), ...translations } }
      : obj
  );
  return { ...effects, textObjects: nextTextObjects };
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

  // A story text-object was translated by the gateway (NLLB). Merge it into the
  // feed cache so an open web viewer swaps to the audience's preferred language
  // live — Prisme Linguistique parity with iOS, which already applies this
  // event in real time.
  const onStoryTranslationUpdated = useCallback(
    (data: StoryTranslationUpdatedEventData) => {
      queryClient.setQueryData<Post[]>(queryKeys.stories.feed(), (old) => {
        if (!old) return old;
        let mutated = false;
        const next = old.map((s) => {
          if (s.id !== data.postId) return s;
          const merged = mergeStoryTextObjectTranslations(
            s.storyEffects,
            data.textObjectIndex,
            data.translations,
          );
          if (merged === s.storyEffects) return s;
          mutated = true;
          return { ...s, storyEffects: merged };
        });
        return mutated ? next : old;
      });
    },
    [queryClient]
  );

  // The author deleted a story (or it was force-removed). Drop it from the feed
  // cache so the tray and viewer stop showing a phantom slide without a refetch.
  const onStoryDeleted = useCallback(
    (data: StoryDeletedEventData) => {
      queryClient.setQueryData<Post[]>(queryKeys.stories.feed(), (old) => {
        if (!old) return old;
        const next = old.filter((s) => s.id !== data.storyId);
        return next.length === old.length ? old : next;
      });
    },
    [queryClient]
  );

  useSocialSocket({
    onStoryCreated,
    onStoryViewed,
    onStoryReacted,
    onStoryTranslationUpdated,
    onStoryDeleted,
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
