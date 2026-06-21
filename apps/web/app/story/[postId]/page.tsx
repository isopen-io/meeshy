'use client';

import { useCallback, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { StoryViewer, useToast } from '@/components/v2';
import { usePostQuery } from '@/hooks/queries/use-post-query';
import { useDeleteStoryMutation, useRecordStoryViewMutation } from '@/hooks/social/use-stories';
import { postToStoryData } from '@/lib/story-transforms';
import { usePreferredLanguage } from '@/hooks/use-post-translation';
import { useAuthStore } from '@/stores/auth-store';

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

  const { data: post, isLoading, isError } = usePostQuery(postId);
  const { recordView } = useRecordStoryViewMutation();
  const deleteStoryMutation = useDeleteStoryMutation();

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
          toastCtx.addToast('Story supprimée', 'success');
          close();
        },
        onError: () => toastCtx.addToast('Impossible de supprimer la story', 'error'),
      });
    },
    [deleteStoryMutation, toastCtx, close]
  );

  const handleReply = useCallback(
    () => toastCtx.addToast('Réponse envoyée', 'success'),
    [toastCtx]
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
          <p className="sr-only">Chargement de la story…</p>
        </>
      ) : (
        <>
          <h1 className="text-lg font-semibold">
            {isError ? 'Story indisponible' : post && !postIsStory ? 'Ce contenu n’est pas une story' : 'Cette story n’existe plus'}
          </h1>
          <p className="max-w-sm text-center text-sm text-white/70">
            {isError
              ? 'Cette story est privée ou a expiré.'
              : post && !postIsStory
                ? 'Le lien pointe vers une publication, pas vers une story.'
                : 'La story que vous cherchez a peut-être expiré (les stories durent 24h).'}
          </p>
          <button
            onClick={close}
            className="mt-2 rounded-full bg-white/15 px-6 py-2 text-sm font-medium hover:bg-white/25 transition-colors"
          >
            Retour au fil
          </button>
        </>
      )}
    </main>
  );
}
