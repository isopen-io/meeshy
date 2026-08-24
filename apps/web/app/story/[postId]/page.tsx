'use client';

import { useCallback, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { StoryViewer, useToast } from '@/components/v2';
import { usePostQuery } from '@/hooks/queries/use-post-query';
import { useDeleteStoryMutation, useRecordStoryViewMutation } from '@/hooks/social/use-stories';
import { useRepostMutation } from '@/hooks/queries/use-post-mutations';
import { usePostRoom } from '@/hooks/social/use-post-room';
import { usePostSocketCacheSync } from '@/hooks/queries/use-post-socket-cache-sync';
import { postToStoryData } from '@/lib/story-transforms';
import { usePreferredLanguage } from '@/hooks/use-post-translation';
import { useCommentTarget } from '@/hooks/use-comment-target';
import { useAuthStore } from '@/stores/auth-store';
import type { PostType } from '@meeshy/shared/types/post';
import { useI18n } from '@/hooks/useI18n';
import { reportService } from '@/services/report.service';
import { postsService } from '@/services/posts.service';
import { shareLink } from '@/lib/share-utils';

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

  // Notification → comment navigation (`?parent=<id>#comment-<id>`) : lecture
  // réactive, transmise au StoryViewer qui ouvre son panneau de commentaires.
  const { targetCommentId, targetParentCommentId } = useCommentTarget();

  const { data: post, isLoading, isError } = usePostQuery(postId);
  const { recordView } = useRecordStoryViewMutation();
  const deleteStoryMutation = useDeleteStoryMutation();
  const repostMutation = useRepostMutation();

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

  const handleReport = useCallback(
    (storyId: string) => {
      if (!window.confirm(t('reportConfirm', 'Report this story?'))) return;
      reportService
        .reportStory(storyId, 'inappropriate', '')
        .then(() => toastCtx.addToast(t('reported', 'Story reported'), 'success'))
        .catch(() => toastCtx.addToast(t('reportError', "Couldn't report the story"), 'error'));
    },
    [toastCtx, t]
  );

  const handleShare = useCallback(
    async (storyId: string) => {
      const story = stories.find((s) => s.id === storyId);
      const localUrl = `${window.location.origin}/story/${storyId}`;
      const title = story?.author.name ?? 'Meeshy';
      const hasNativeShare = typeof navigator !== 'undefined' && !!navigator.share;
      try {
        const { shortUrl } = await postsService.sharePost(storyId, { generateLink: true });
        const shared = await shareLink(shortUrl ?? localUrl, title, story?.content ?? '');
        if (shared) {
          toastCtx.addToast(t('shared', 'Shared!'), 'success');
        } else if (!hasNativeShare) {
          toastCtx.addToast(t('linkCopied', 'Link copied!'), 'success');
        }
        // else: native share sheet dismissed — nothing was copied, no toast
      } catch {
        toastCtx.addToast(t('shareError', "Couldn't share the story"), 'error');
      }
    },
    [stories, toastCtx, t]
  );

  /**
   * Loi du miroir (directive produit 2026-08-23) : le format d'un repost suit
   * celui de sa source. Ce site n'envoyait aucun `targetType`, donc le gateway
   * retombait sur `?? POST` et republier une story fabriquait un post
   * PERMANENT — l'utilisateur croyait repartager, il ancrait.
   *
   * Les deux gestes partent ensemble, délibérément : livrer le miroir seul
   * aurait donné 20 h d'éphémère là où l'on obtenait du permanent, sans aucun
   * recours. La capacité d'ancrer doit exister avant que le défaut ne bascule.
   */
  const repostStory = useCallback(
    (storyId: string, targetType: PostType) => {
      // La scène VUE, jamais la racine de sa chaîne — et c'est délibéré, ici
      // comme sur le jumeau iOS (`StoryViewerView.repostAsPostDirect` envoie
      // `story.id`, quand les surfaces de CARTE passent par `RepostTargeting`).
      // Deux raisons, chacune suffisante :
      //   - `repostPost` recopie le contenu et les médias d'une source
      //     ÉPHÉMÈRE dans le repost, donc la story vue est autonome : viser la
      //     racine n'éviterait aucune carte vide ;
      //   - `repostPost` refuse un original dont l'échéance est passée. Une
      //     story repartagée vit plus longtemps que sa racine, donc grimper
      //     ferait échouer un geste qui réussit aujourd'hui.
      repostMutation.mutate(
        { postId: storyId, data: { isQuote: false, targetType } },
        {
          onSuccess: () => toastCtx.addToast(t('reposted', 'Reposted!'), 'success'),
          onError: () => toastCtx.addToast(t('repostError', "Couldn't repost"), 'error'),
        },
      );
    },
    [repostMutation, toastCtx, t]
  );

  /** Le miroir — une story repartagée reste une story, éphémère. */
  const handleRepost = useCallback(
    (storyId: string) => repostStory(storyId, 'STORY'),
    [repostStory]
  );

  /** L'ANCRAGE — « garder ça pour de bon » : la story devient un post permanent. */
  const handleRepostAsPost = useCallback(
    (storyId: string) => repostStory(storyId, 'POST'),
    [repostStory]
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
        onReport={handleReport}
        onShare={handleShare}
        onRepost={post?.visibility === 'PUBLIC' ? handleRepost : undefined}
        onRepostAsPost={post?.visibility === 'PUBLIC' ? handleRepostAsPost : undefined}
        targetCommentId={targetCommentId}
        targetParentCommentId={targetParentCommentId}
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
