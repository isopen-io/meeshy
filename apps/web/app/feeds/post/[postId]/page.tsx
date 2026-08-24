'use client';

import { useState, useCallback, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { markScopeNotificationsRead } from '@/lib/notifications/notification-read-sync';
import { usePostQuery } from '@/hooks/queries/use-post-query';
import { useCommentsInfiniteQuery, useCommentsList } from '@/hooks/queries/use-comments-query';
import {
  useLikePostMutation,
  useUnlikePostMutation,
  useBookmarkPostMutation,
  useUnbookmarkPostMutation,
  useDeletePostMutation,
  useUpdatePostMutation,
  useRepostMutation,
  useTranslatePostMutation,
} from '@/hooks/queries/use-post-mutations';
import {
  useCreateCommentMutation,
  useDeleteCommentMutation,
  useLikeCommentMutation,
  useUnlikeCommentMutation,
} from '@/hooks/queries/use-comment-mutations';
import { usePostSocketCacheSync } from '@/hooks/queries/use-post-socket-cache-sync';
import { usePostRoom } from '@/hooks/social/use-post-room';
import { usePreferredLanguage, usePreferredLanguages } from '@/hooks/use-post-translation';
import { useCommentTarget } from '@/hooks/use-comment-target';
import { postBackgroundSound } from '@/lib/story-transforms';
import { PostDetail } from '@/components/v2/PostDetail';
import { PostEditor } from '@/components/v2/PostEditor';
import type { PostType, PostVisibility } from '@meeshy/shared/types/post';
import { repostTargetId } from '@meeshy/shared/utils/repost-target';
import { RepostModal } from '@/components/v2/RepostModal';
import { useToast } from '@/components/v2';
import { Skeleton } from '@/components/v2/Skeleton';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { useAuthStore } from '@/stores/auth-store';
import { postsService, recordAnonymousView } from '@/services/posts.service';
import { reportService } from '@/services/report.service';
import { getOrCreateWebSessionKey } from '@/lib/anonymous-session';
import { isHeartLikedByMe } from '@/lib/reactions';
import { shareLink } from '@/lib/share-utils';

/**
 * Post detail page (v1 canonical path).
 *
 * Mounted at `/feeds/post/[postId]` — the URL minted by the gateway
 * for share intents and parsed by the iOS universal-link handler.
 * This is the canonical (and only) post detail renderer.
 */
export default function PostDetailPage() {
  const params = useParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const postId = params.postId as string;
  const toastCtx = useToast();
  const showToast = useCallback(
    (title: string, type: 'success' | 'error' | 'info') => toastCtx.addToast(title, type),
    [toastCtx],
  );

  const currentUser = useAuthStore((s) => s.user);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const userLanguage = usePreferredLanguage();
  const preferredLanguages = usePreferredLanguages();

  // Notification → comment navigation: the link builder appends a
  // `#comment-<id>` anchor (plus `?parent=<id>` when the target is a reply, or
  // a legacy `?comment=<id>` query). Read REACTIVELY (hashchange / popstate /
  // client navigations) so landing on this already-mounted page with a new
  // target re-runs the scroll + highlight in PostDetail → CommentList.
  const { targetCommentId, targetParentCommentId } = useCommentTarget();

  const postQuery = usePostQuery(postId);
  const commentsQuery = useCommentsInfiniteQuery({ postId, enabled: !!postId });
  const comments = useCommentsList(commentsQuery);

  usePostSocketCacheSync({ currentUserId: currentUser?.id });
  // Join the post room so comment / reaction events broadcast to
  // `ROOMS.post(postId)` reach this viewer even when they are not a friend of
  // the author (PUBLIC post). Without it, real-time comments never surface.
  usePostRoom(postId);

  // Mutations
  const likeMutation = useLikePostMutation();
  const unlikeMutation = useUnlikePostMutation();
  const bookmarkMutation = useBookmarkPostMutation();
  const unbookmarkMutation = useUnbookmarkPostMutation();
  const deleteMutation = useDeletePostMutation();
  const updateMutation = useUpdatePostMutation();
  const repostMutation = useRepostMutation();
  const translateMutation = useTranslatePostMutation();
  const createCommentMutation = useCreateCommentMutation();
  const deleteCommentMutation = useDeleteCommentMutation();
  const likeCommentMutation = useLikeCommentMutation();
  const unlikeCommentMutation = useUnlikeCommentMutation();

  const [editorOpen, setEditorOpen] = useState(false);
  const [repostModalOpen, setRepostModalOpen] = useState(false);
  // Constat 2 (F7c) — état muet du lecteur LOCAL du badge B3.3-6 (le détail
  // ne possède aucun lecteur : ce bouton reste cosmétique tant que la
  // résolution d'URL de son web n'existe pas — dette explicite, plan F3).
  // Démarre MUTED, comme `StoryViewer` (`isBackgroundSoundMuted`).
  const [backgroundSoundMuted, setBackgroundSoundMuted] = useState(true);
  const toggleBackgroundSoundMute = useCallback(() => setBackgroundSoundMuted((m) => !m), []);

  // Fire-and-forget view increment on first mount.
  // Failures are intentionally silent: an unreachable counter must not
  // block the user from reading the post.
  // - Authentifié → parcours inscrit (viewPost → viewCount).
  // - Anonyme (sans compte) → ping postOpenCount dédupliqué par session header
  //   (spec 2026-06-17). On évite ainsi le 401 inutile de viewPost en anonyme.
  useEffect(() => {
    if (!postId) return;
    if (isAuthenticated) {
      postsService.viewPost(postId).catch(() => {});
      // Consommer les notifications du post (nouveau post, commentaires,
      // réactions — portée serveur `context.postId`). `viewPost` ne marque
      // qu'à la PREMIÈRE vue : une notification arrivée après resterait non
      // lue à vie sans cet appel dédié.
      markScopeNotificationsRead(queryClient, { kind: 'post', postId });
    } else {
      recordAnonymousView(postId, getOrCreateWebSessionKey());
    }
  }, [postId, isAuthenticated, queryClient]);

  if (postQuery.isLoading) {
    return (
      <DashboardLayout title="Post" className="!max-w-none !px-0" backHref="/feed/posts">
        <div className="h-full overflow-auto bg-[var(--gp-background)] transition-colors">
          <div className="max-w-2xl mx-auto px-6 py-8 space-y-4">
            <Skeleton className="h-48 rounded-2xl" />
            <Skeleton className="h-32 rounded-2xl" />
          </div>
        </div>
      </DashboardLayout>
    );
  }

  if (postQuery.isError || !postQuery.data) {
    return (
      <DashboardLayout title="Post" className="!max-w-none !px-0" backHref="/feed/posts">
        <div className="h-full overflow-auto bg-[var(--gp-background)] transition-colors">
          <div className="max-w-2xl mx-auto px-6 py-16 text-center">
            <p className="text-[var(--gp-text-muted)]">Post not found or an error occurred.</p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  const post = postQuery.data;
  const isAuthor = post.authorId === currentUser?.id;
  // Constat 2 (F7c) — même extracteur PUR que `StoryViewer` (`postBackgroundSound`,
  // `lib/story-transforms.ts`) : un seul résolveur de crédit, jamais deux
  // implémentations qui pourraient diverger.
  const { sound: backgroundSound, meta: backgroundSoundMeta } = postBackgroundSound(post);

  const handleShare = async () => {
    const localUrl = `${window.location.origin}/feeds/post/${post.id}`;
    const title = post.author?.displayName ?? post.author?.username ?? 'Meeshy';
    const hasNativeShare = typeof navigator !== 'undefined' && !!navigator.share;
    try {
      const { shortUrl } = await postsService.sharePost(post.id, { generateLink: true });
      const shared = await shareLink(shortUrl ?? localUrl, title, post.content ?? '');
      if (shared) {
        showToast('Shared!', 'success');
      } else if (!hasNativeShare) {
        showToast('Link copied!', 'success');
      }
      // else: native share sheet dismissed — nothing was copied, no toast
    } catch {
      showToast("Couldn't share the post.", 'error');
    }
  };

  const handleDeletePost = () => {
    deleteMutation.mutate(post.id, {
      onSuccess: () => router.back(),
    });
  };

  const handleEdit = () => setEditorOpen(true);

  const handleSaveEdit = (data: {
    content: string;
    visibility: PostVisibility;
    visibilityUserIds: string[];
  }) => {
    updateMutation.mutate(
      {
        postId: post.id,
        data: {
          content: data.content,
          visibility: data.visibility,
          visibilityUserIds: data.visibilityUserIds,
        },
      },
      {
        onSuccess: () => {
          setEditorOpen(false);
          showToast('Post updated', 'success');
        },
        onError: () => showToast('Failed to update', 'error'),
      },
    );
  };

  /**
   * Le miroir et l'ancrage partent ENSEMBLE, et c'est ici qu'ils manquaient le
   * plus. Cette page est montée sur TROIS routes — `/feeds/post/:id`,
   * `/post/:id` et `/mood/:id`, cible officielle de résolution des liens
   * tracés de type STATUS (`buildWebFallbackTarget`) — donc sa carte peut être
   * éphémère, contrairement à `/reel/:id` (garde `seedIsReel`) et
   * `/story/:id` (garde `postIsStory`).
   *
   * Le miroir seul y serait DESTRUCTEUR : un mood republié en STATUS vit une
   * heure, puis `ExpiredStoriesCleanupService` détruit la ligne — là où le
   * même geste donnait un post permanent. L'ancrage est le recours.
   */
  const repostAs = (targetType: PostType, content?: string) => {
    const isQuote = content !== undefined;
    repostMutation.mutate(
      // La RÉFÉRENCE remonte la chaîne, le FORMAT reste celui de la carte agie.
      { postId: repostTargetId(post), data: { ...(isQuote ? { content } : {}), isQuote, targetType } },
      {
        onSuccess: () => {
          setRepostModalOpen(false);
          showToast(isQuote ? 'Quoted!' : 'Reposted!', 'success');
        },
        onError: () => showToast(isQuote ? 'Failed to quote' : 'Failed to repost', 'error'),
      },
    );
  };

  const handleRepost = () => repostAs(post.type);

  /** L'ANCRAGE — « garder ça pour de bon » : la seule cible permanente. */
  const handleRepostAsPost = () => repostAs('POST');

  const handleReportPost = () => {
    if (!window.confirm('Report this post?')) return;
    reportService
      .reportPost(post.id, 'inappropriate', '')
      .then(() => showToast('Post reported', 'success'))
      .catch(() => showToast("Couldn't report the post.", 'error'));
  };

  const handleQuote = (content: string) => repostAs(post.type, content);

  return (
    <DashboardLayout title="Post" className="!max-w-none !px-0" backHref="/feed/posts">
      <div className="h-full overflow-auto bg-[var(--gp-background)] transition-colors">
        <main className="px-6 py-8">
          <PostDetail
            post={post}
            comments={comments}
            backgroundSound={backgroundSound}
            backgroundSoundMeta={backgroundSoundMeta}
            backgroundSoundMuted={backgroundSoundMuted}
            onToggleBackgroundSoundMute={toggleBackgroundSoundMute}
            currentUserId={currentUser?.id}
            currentUser={currentUser ? { username: currentUser.username, avatar: currentUser.avatar } : null}
            userLanguage={userLanguage}
            preferredLanguages={preferredLanguages}
            isLiked={isHeartLikedByMe(post)}
            isBookmarked={!!post.bookmarkedAt}
            userReaction={post.currentUserReactions?.[0]}
            commentsLoading={commentsQuery.isLoading}
            commentsHasMore={commentsQuery.hasNextPage ?? false}
            commentsLoadingMore={commentsQuery.isFetchingNextPage}
            onLike={() => {
              const isLiked = isHeartLikedByMe(post);
              if (isLiked) {
                unlikeMutation.mutate({ postId: post.id });
              } else {
                likeMutation.mutate({ postId: post.id });
              }
            }}
            onUnlike={() => unlikeMutation.mutate({ postId: post.id })}
            onReact={(emoji) => {
              const reactions = post.currentUserReactions ?? [];
              if (reactions.includes(emoji)) {
                unlikeMutation.mutate({ postId: post.id, emoji });
              } else {
                likeMutation.mutate({ postId: post.id, emoji });
              }
            }}
            onBookmark={() => {
              if (post.bookmarkedAt) {
                unbookmarkMutation.mutate(post.id);
              } else {
                bookmarkMutation.mutate(post.id);
              }
            }}
            onUnbookmark={() => unbookmarkMutation.mutate(post.id)}
            onShare={handleShare}
            onRepost={() => setRepostModalOpen(true)}
            /* Reposter un POST ne propose pas l'ancrage deux fois : il est
               déjà son propre ancrage (jumeau iOS : `offeredFormats`,
               `ComposerIntent.swift`). */
            onRepostAsPost={post.type === 'POST' ? undefined : handleRepostAsPost}
            onEdit={isAuthor ? handleEdit : undefined}
            onDelete={isAuthor ? handleDeletePost : undefined}
            onReport={isAuthor ? undefined : handleReportPost}
            onTranslate={() => translateMutation.mutate({ postId: post.id, targetLanguage: userLanguage })}
            onDownloadMedia={(mediaId) => postsService.recordMediaDownloads(post.id, [mediaId], 'detail')}
            onDownloadRepostMedia={(mediaId) => {
              if (post.repostOf?.id) postsService.recordMediaDownloads(post.repostOf.id, [mediaId], 'detail');
            }}
            onTapRepost={(repostId) => router.push(`/feeds/post/${repostId}`)}
            onSubmitComment={(content, parentId) =>
              createCommentMutation.mutate({ postId: post.id, content, parentId })
            }
            onLoadMoreComments={() => commentsQuery.fetchNextPage()}
            onLikeComment={(commentId) => likeCommentMutation.mutate({ postId: post.id, commentId })}
            onUnlikeComment={(commentId) => unlikeCommentMutation.mutate({ postId: post.id, commentId })}
            onDeleteComment={(commentId) => deleteCommentMutation.mutate({ postId: post.id, commentId })}
            targetCommentId={targetCommentId}
            targetParentCommentId={targetParentCommentId}
          />
        </main>

        <PostEditor
          open={editorOpen}
          initialContent={post.content ?? ''}
          initialVisibility={post.visibility}
          initialVisibilityUserIds={post.visibilityUserIds}
          onSave={handleSaveEdit}
          onClose={() => setEditorOpen(false)}
          saving={updateMutation.isPending}
        />

        <RepostModal
          open={repostModalOpen}
          originalAuthor={post.author?.displayName ?? post.author?.username}
          originalContent={post.content ?? undefined}
          onRepost={handleRepost}
          onQuote={handleQuote}
          onClose={() => setRepostModalOpen(false)}
          saving={repostMutation.isPending}
        />
      </div>
    </DashboardLayout>
  );
}
