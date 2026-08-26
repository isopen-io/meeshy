'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/stores/auth-store';
import { markScopeNotificationsRead } from '@/lib/notifications/notification-read-sync';
import { useToast } from '@/components/v2';
import { ReelPlayer } from '@/components/feed/ReelPlayer';
import { Dialog, DialogBody, DialogHeader } from '@/components/v2/Dialog';
import { MeeshyComposer } from '@/components/composer/MeeshyComposer';
import { composerFormatOf } from '@/lib/composer-door';
import type { ComposerRepostPayload } from '@/components/composer/payload';
import { useComposerRepost } from '@/hooks/composer/useComposerRepost';
import { usePostQuery } from '@/hooks/queries/use-post-query';
import { useReelsFeedQuery, useReelsFeedPosts } from '@/hooks/queries/use-reels-feed-query';
import {
  useLikePostMutation,
  useUnlikePostMutation,
  useBookmarkPostMutation,
  useUnbookmarkPostMutation,
} from '@/hooks/queries/use-post-mutations';
import { usePostSocketCacheSync } from '@/hooks/queries/use-post-socket-cache-sync';
import { usePostRoom } from '@/hooks/social/use-post-room';
import { usePreferredLanguage } from '@/hooks/use-post-translation';
import { useImpressionTracking } from '@/hooks/use-impression-tracking';
import { useI18n } from '@/hooks/useI18n';
import type { Post } from '@meeshy/shared/types/post';
import { repostTargetId } from '@meeshy/shared/utils/repost-target';
import { shareLink } from '@/lib/share-utils';
import { reportService } from '@/services/report.service';
import { postsService } from '@/services/posts.service';

const LIKE_EMOJI = '❤️';

// Cette page ne monte `MeeshyComposer` que sur la porte `repost` — aucun
// composer de CRÉATION n'existe ici. `onPublish` reste requis par le contrat
// mais n'est jamais servi par ce format, voir `MeeshyComposer.tsx`.
function NOOP_PUBLISH(): void {}

function isReelLiked(post: Post): boolean {
  return (post.currentUserReactions ?? []).includes(LIKE_EMOJI) || (post.isLikedByMe ?? false);
}

/**
 * Immersive reel thread (`/reel/:id`).
 *
 * Resolves the seed reel by id (guaranteed even for deep links) and threads the
 * affinity-ranked reels behind it (`/posts/feed/reels?seed=:id`). The gateway
 * excludes the seed from its results, so we prepend it here. Arrow keys / wheel
 * / on-screen chevrons advance through the thread; reaching the tail pulls the
 * next affinity page.
 */
export default function ReelPage() {
  const router = useRouter();
  const params = useParams<{ postId: string }>();
  const postId = params?.postId;
  const userLanguage = usePreferredLanguage();
  const toastCtx = useToast();
  const { t } = useI18n('reel');
  const { t: tc } = useI18n('common');

  usePostSocketCacheSync();

  const { data: seed, isLoading, isError } = usePostQuery(postId);
  const reelsQuery = useReelsFeedQuery({ seed: postId, enabled: !!postId });
  const affinityReels = useReelsFeedPosts(reelsQuery);

  const likeMutation = useLikePostMutation();
  const unlikeMutation = useUnlikePostMutation();
  const bookmarkMutation = useBookmarkPostMutation();
  const unbookmarkMutation = useUnbookmarkPostMutation();
  // W8 — le site UNIQUE de la charge repost, voir `useComposerRepost.ts`.
  const { repost: submitRepost, isPending: isReposting } = useComposerRepost();
  const [repostModalOpen, setRepostModalOpen] = useState(false);

  // Only a REEL seeds the immersive player; any other post type (stale/scraped
  // link) is treated as unavailable rather than forced into reel chrome.
  const seedIsReel = seed?.type === 'REEL';

  // Thread = seed reel first (excluded by the gateway), then the affinity reels.
  const thread = useMemo(() => {
    if (!seed || !seedIsReel) return [] as Post[];
    const others = affinityReels.filter((p) => p.id !== seed.id);
    return [seed, ...others];
  }, [seed, seedIsReel, affinityReels]);

  const [index, setIndex] = useState(0);

  // Reset to the seed when the route changes — Next.js reuses this mounted
  // component when navigating between two /reel/:id deep links.
  useEffect(() => {
    setIndex(0);
  }, [postId]);

  // Clamp index if the thread shrinks (e.g. cache eviction).
  useEffect(() => {
    if (index > thread.length - 1 && thread.length > 0) setIndex(thread.length - 1);
  }, [thread.length, index]);

  // Pull more affinity pages as we reach i = N - 3 in the thread.
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = reelsQuery;
  useEffect(() => {
    if (thread.length > 0 && index >= thread.length - 3 && hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  }, [index, thread.length, hasNextPage, isFetchingNextPage, fetchNextPage]);

  const current = thread[index];
  const currentId = current?.id ?? '';

  // Join the room of the reel currently on screen so live comments / reactions
  // broadcast to `ROOMS.post(currentId)` reach the viewer. Re-joins as the
  // thread advances (leave previous reel, join next).
  usePostRoom(currentId || null);

  // Record an impression for whichever reel is on screen (source: 'feed', as iOS).
  const { record: recordImpression } = useImpressionTracking({ source: 'feed' });
  useEffect(() => {
    if (currentId) recordImpression(currentId);
  }, [currentId, recordImpression]);

  // Consommer les notifications du réel affiché (nouveau réel, commentaires,
  // réactions — portée serveur `context.postId`). Le viewer de réels
  // n'émettait AUCUN marquage : les notifications de réels restaient non lues
  // à vie. Miroir du `onPostOpened` iOS, coalescé par le module.
  const queryClient = useQueryClient();
  const { isAuthenticated, user } = useAuthStore();
  useEffect(() => {
    if (currentId && isAuthenticated) {
      markScopeNotificationsRead(queryClient, { kind: 'post', postId: currentId });
    }
  }, [currentId, isAuthenticated, queryClient]);

  const close = useCallback(() => {
    if (window.history.length > 1) router.back();
    else router.push('/feed/posts');
  }, [router]);

  const onLike = useCallback(() => {
    if (!current) return;
    if (isReelLiked(current)) unlikeMutation.mutate({ postId: current.id });
    else likeMutation.mutate({ postId: current.id });
  }, [current, likeMutation, unlikeMutation]);

  const onBookmark = useCallback(() => {
    if (!current) return;
    if (current.bookmarkedAt) unbookmarkMutation.mutate(current.id);
    else bookmarkMutation.mutate(current.id);
  }, [current, bookmarkMutation, unbookmarkMutation]);

  const onShare = useCallback(async () => {
    if (!current) return;
    const localUrl = `${window.location.origin}/reel/${current.id}`;
    const title = current.author?.displayName ?? current.author?.username ?? 'Meeshy';
    const hasNativeShare = typeof navigator !== 'undefined' && !!navigator.share;
    try {
      const { shortUrl } = await postsService.sharePost(current.id, { generateLink: true });
      const shared = await shareLink(shortUrl ?? localUrl, title, current.content ?? '');
      if (shared) {
        toastCtx.addToast(t('shared', 'Shared!'), 'success');
      } else if (!hasNativeShare) {
        toastCtx.addToast(t('linkCopied', 'Link copied!'), 'success');
      }
      // else: native share sheet dismissed — nothing was copied, no toast
    } catch {
      toastCtx.addToast(t('linkCopyError', "Couldn't share the reel"), 'error');
    }
  }, [current, toastCtx, t]);

  // Reel comment notifications link to `/reel/:id#comment-:cid`. The reel player
  // surfaces comments via the post-detail thread, so forward to it preserving the
  // anchor — the post page scrolls to and highlights the exact comment. Replace
  // (not push) so Back returns to where the user came from, not this redirect.
  useEffect(() => {
    if (typeof window === 'undefined' || !postId) return;
    const searchParams = new URLSearchParams(window.location.search);
    const anchorCommentId = window.location.hash.match(/^#comment-(.+)$/)?.[1]
      ?? searchParams.get('comment');
    if (anchorCommentId) {
      // Préserver `?parent=<id>` (cible = réponse) pour que la page post
      // déplie le bon thread et surligne la réponse exacte.
      const parentCommentId = searchParams.get('parent');
      const parentQuery = parentCommentId
        ? `?parent=${encodeURIComponent(parentCommentId)}`
        : '';
      router.replace(`/feeds/post/${postId}${parentQuery}#comment-${anchorCommentId}`);
    }
  }, [postId, router]);

  const onComment = useCallback(() => {
    if (current) router.push(`/feeds/post/${current.id}`);
  }, [current, router]);

  const onReport = useCallback(() => {
    if (!current) return;
    if (!window.confirm(t('reportConfirm', 'Report this reel?'))) return;
    reportService
      .reportPost(current.id, 'inappropriate', '')
      .then(() => toastCtx.addToast(t('reported', 'Reel reported'), 'success'))
      .catch(() => toastCtx.addToast(t('reportError', "Couldn't report the reel"), 'error'));
  }, [current, toastCtx, t]);

  const onRepost = useCallback(() => {
    if (current) setRepostModalOpen(true);
  }, [current]);

  // Loi du miroir + loi de l'ancrage (§ loi 5) : `payload.targetType` porte le
  // format ACTUELLEMENT sélectionné dans l'éventail de `ComposerRepostSurface`
  // — celui de la CARTE agie par défaut, celui de l'ancrage si l'auteur l'a
  // choisi. La RÉFÉRENCE remonte la chaîne (`repostTargetId`). `submitRepost`
  // est le site UNIQUE.
  const handleRepostSubmit = useCallback(
    (payload: ComposerRepostPayload) => {
      if (!current) return;
      submitRepost(
        { targetId: repostTargetId(current), targetType: payload.targetType, isQuote: payload.isQuote, content: payload.content },
        {
          onSuccess: () => {
            setRepostModalOpen(false);
            toastCtx.addToast(t(payload.isQuote ? 'quoted' : 'reposted', payload.isQuote ? 'Quoted!' : 'Reposted!'), 'success');
          },
          onError: () => toastCtx.addToast(t('repostError', "Couldn't repost"), 'error'),
        },
      );
    },
    [current, submitRepost, toastCtx, t],
  );

  const onDownload = useCallback((mediaId: string, owningPostId: string) => {
    postsService.recordMediaDownloads(owningPostId, [mediaId], 'reel');
  }, []);

  if (current) {
    return (
      <>
        <ReelPlayer
          key={current.id}
          reel={current}
          index={index}
          total={thread.length}
          hasPrev={index > 0}
          hasNext={index < thread.length - 1}
          isLiked={isReelLiked(current)}
          isBookmarked={!!current.bookmarkedAt}
          userLanguage={userLanguage}
          onPrev={() => setIndex((i) => Math.max(0, i - 1))}
          onNext={() => setIndex((i) => Math.min(thread.length - 1, i + 1))}
          onClose={close}
          onLike={onLike}
          onComment={onComment}
          onShare={onShare}
          onBookmark={onBookmark}
          onReport={user?.id !== current.authorId ? onReport : undefined}
          onRepost={onRepost}
          onDownload={onDownload}
        />
        {repostModalOpen && (
          <Dialog open onClose={() => setRepostModalOpen(false)} labelledBy="reel-repost-composer-title">
            <DialogHeader>
              <h2 id="reel-repost-composer-title" className="text-base font-semibold text-[var(--gp-text-primary)]">
                {tc('composer.repost.title')}
              </h2>
            </DialogHeader>
            <DialogBody>
              <MeeshyComposer
                door={{ kind: 'repost', sourceFormat: composerFormatOf(current.type) }}
                onPublish={NOOP_PUBLISH}
                repostSource={{ author: current.author?.displayName ?? current.author?.username, content: current.content ?? undefined }}
                onRepost={handleRepostSubmit}
                disabled={isReposting}
                repostSaving={isReposting}
              />
            </DialogBody>
          </Dialog>
        )}
      </>
    );
  }

  return (
    <main className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-black text-white">
      {isLoading ? (
        <>
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-white/20 border-t-white" aria-hidden="true" />
          <p className="sr-only">{t('loading', 'Loading reel…')}</p>
        </>
      ) : (
        <>
          <h1 className="text-lg font-semibold">
            {isError
              ? t('unavailableTitle', 'Reel unavailable')
              : seed && !seedIsReel
                ? t('notAReelTitle', "This content isn't a reel")
                : t('goneTitle', 'This reel no longer exists')}
          </h1>
          <p className="max-w-sm text-center text-sm text-white/70">
            {isError
              ? t('unavailableBody', 'This reel is private or has been deleted.')
              : seed && !seedIsReel
                ? t('notAReelBody', 'The link points to a post, not a reel.')
                : t('goneBody', "The reel you're looking for can't be found.")}
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
