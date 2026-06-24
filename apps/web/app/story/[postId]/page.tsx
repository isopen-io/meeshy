'use client';

import { useCallback, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { StoryViewer, useToast } from '@/components/v2';
import { usePostQuery } from '@/hooks/queries/use-post-query';
import { useDeleteStoryMutation, useRecordStoryViewMutation } from '@/hooks/social/use-stories';
import { usePostRoom } from '@/hooks/social/use-post-room';
import { usePostSocketCacheSync } from '@/hooks/queries/use-post-socket-cache-sync';
import { postToStoryData } from '@/lib/story-transforms';
import { usePreferredLanguage } from '@/hooks/use-post-translation';
import { useAuthStore } from '@/stores/auth-store';
import { useI18n } from '@/hooks/useI18n';

/**
 * Immersive single-story viewer (`/story/:id`).
 *
 * Reuses the full-screen `StoryViewer` (progress bars, overlays, Prisme
 * translation) used by the feed, fed with the one shared story resolved by id.
 * Respects visibility: when the gateway refuses a private story the query
 * errors and we render a neutral "unavailable" surface rather than leaking it.
 */
export default function StoryPage() {
  const router = useRouter();
  const params = useParams<{ postId: string }>();
  const postId = params?.postId;
  const userLanguage = usePreferredLanguage();
  const currentUserId = useAuthStore((s) => s.user?.id) ?? '';
  const toastCtx = useToast();
  const { t } = useI18n('story');

  const { data: post, isLoading, isError } = usePostQuery(postId);
  const { recordView } = useRecordStoryViewMutation();
  const deleteStoryMutation = useDeleteStoryMutation();

  // Join the story room + consume its real-time events (reactions, comments)
  // broadcast to `ROOMS.post(postId)`. Mirrors the post detail page so a viewer
  // of someone else's story sees live updates without a reload.
  usePostSocketCacheSync({ currentUserId });
  usePostRoom(postId);

  // Only a STORY drives the ephemeral viewer; any other post type (stale link)
  // is treated as unavailable rather than forced into the 24h-story chrome.
  const postIsStory = post?.type === 'STORY';
  const stories = useMemo(
    () => (post && postIsStory ? [postToStoryData(post)] : []),
    [post, postIsStory],
  );

  const close = useCallback(() => {
    if (window.history.length > 1) router.back();
    else router.push('/feed/posts');
  }, [router]);

  const handleDelete = useCallback(
    (storyId: string) => {
      deleteStoryMutation.mutate(storyId, {
        onSuccess: () => {
          toastCtx.addToast(t('deleted', 'Story deleted'), 'success');
          close();
        },
        onError: () => toastCtx.addToast(t('deleteError', "Couldn't delete the story"), 'error'),
      });
    },
    [deleteStoryMutation, toastCtx, close, t]
  );

  const handleReply = useCallback(
    () => toastCtx.addToast(t('replySent', 'Reply sent'), 'success'),
    [toastCtx, t]
  );

  if (stories.length > 0) {
    return (
      <StoryViewer
        stories={stories}
        initialIndex={0}
        userLanguage={userLanguage}
        currentUserId={currentUserId}
        onClose={close}
        onView={(id) => recordView(id)}
        onReply={handleReply}
        onDelete={handleDelete}
      />
    );
  }

  return (
    <main className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-black text-white">
      {isLoading ? (
        <>
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-white/20 border-t-white" aria-hidden="true" />
          <p className="sr-only">{t('loading', 'Loading story…')}</p>
        </>
      ) : (
        <>
          <h1 className="text-lg font-semibold">
            {isError
              ? t('unavailableTitle', 'Story unavailable')
              : post && !postIsStory
                ? t('notAStoryTitle', "This content isn't a story")
                : t('goneTitle', 'This story no longer exists')}
          </h1>
          <p className="max-w-sm text-center text-sm text-white/70">
            {isError
              ? t('unavailableBody', 'This story is private or has expired.')
              : post && !postIsStory
                ? t('notAStoryBody', 'The link points to a post, not a story.')
                : t('goneBody', "The story you're looking for may have expired (stories last 24h).")}
          </p>
          <button
            onClick={close}
            className="mt-2 rounded-full bg-white/15 px-6 py-2 text-sm font-medium hover:bg-white/25 transition-colors"
          >
            {t('backToFeed', 'Back to feed')}
          </button>
        </>
      )}
    </main>
  );
}
