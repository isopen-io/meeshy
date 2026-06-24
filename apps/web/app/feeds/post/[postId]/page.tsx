'use client';

import { useState, useCallback, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { usePostQuery } from '@/hooks/queries/use-post-query';
import { useCommentsInfiniteQuery, useCommentsList } from '@/hooks/queries/use-comments-query';
import {
  useLikePostMutation,
  useUnlikePostMutation,
  useBookmarkPostMutation,
  useUnbookmarkPostMutation,
  useDeletePostMutation,
  useSharePostMutation,
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
import { usePreferredLanguage } from '@/hooks/use-post-translation';
import { PostDetail } from '@/components/v2/PostDetail';
import { PostEditor } from '@/components/v2/PostEditor';
import { RepostModal } from '@/components/v2/RepostModal';
import { useToast } from '@/components/v2';
import { Skeleton } from '@/components/v2/Skeleton';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { useAuthStore } from '@/stores/auth-store';
import { postsService, recordAnonymousView } from '@/services/posts.service';
import { getOrCreateWebSessionKey } from '@/lib/anonymous-session';

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
  const postId = params.postId as string;
  const toastCtx = useToast();
  const showToast = useCallback(
    (title: string, type: 'success' | 'error' | 'info') => toastCtx.addToast(title, type),
    [toastCtx],
  );

  const currentUser = useAuthStore((s) => s.user);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const userLanguage = usePreferredLanguage();

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
  const shareMutation = useSharePostMutation();
  const updateMutation = useUpdatePostMutation();
  const repostMutation = useRepostMutation();
  const translateMutation = useTranslatePostMutation();
  const createCommentMutation = useCreateCommentMutation();
  const deleteCommentMutation = useDeleteCommentMutation();
  const likeCommentMutation = useLikeCommentMutation();
  const unlikeCommentMutation = useUnlikeCommentMutation();

  const [editorOpen, setEditorOpen] = useState(false);
  const [repostModalOpen, setRepostModalOpen] = useState(false);

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
    } else {
      recordAnonymousView(postId, getOrCreateWebSessionKey());
    }
  }, [postId, isAuthenticated]);

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

  const handleShare = async () => {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/feeds/post/${post.id}`);
      shareMutation.mutate({ postId: post.id });
      showToast('Link copied!', 'success');
    } catch {
      /* clipboard denied / unavailable — silent */
    }
  };

  const handleDeletePost = () => {
    deleteMutation.mutate(post.id, {
      onSuccess: () => router.back(),
    });
  };

  const handleEdit = () => setEditorOpen(true);

  const handleSaveEdit = (data: { content: string; visibility: string }) => {
    updateMutation.mutate(
      {
        postId: post.id,
        data: { content: data.content, visibility: data.visibility as 'PUBLIC' | 'FRIENDS' | 'PRIVATE' },
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

  const handleRepost = () => {
    repostMutation.mutate(
      { postId: post.id, data: { isQuote: false } },
      {
        onSuccess: () => {
          setRepostModalOpen(false);
          showToast('Reposted!', 'success');
        },
        onError: () => showToast('Failed to repost', 'error'),
      },
    );
  };

  const handleQuote = (content: string) => {
    repostMutation.mutate(
      { postId: post.id, data: { content, isQuote: true } },
      {
        onSuccess: () => {
          setRepostModalOpen(false);
          showToast('Quoted!', 'success');
        },
        onError: () => showToast('Failed to quote', 'error'),
      },
    );
  };

  return (
    <DashboardLayout title="Post" className="!max-w-none !px-0" backHref="/feed/posts">
      <div className="h-full overflow-auto bg-[var(--gp-background)] transition-colors">
        <main className="px-6 py-8">
          <PostDetail
            post={post}
            comments={comments}
            currentUserId={currentUser?.id}
            currentUser={currentUser ? { username: currentUser.username, avatar: currentUser.avatar } : null}
            userLanguage={userLanguage}
            isLiked={(post.currentUserReactions ?? []).includes('❤️') || (post.isLikedByMe ?? false)}
            isBookmarked={!!post.bookmarkedAt}
            userReaction={post.currentUserReactions?.[0]}
            commentsLoading={commentsQuery.isLoading}
            commentsHasMore={commentsQuery.hasNextPage ?? false}
            commentsLoadingMore={commentsQuery.isFetchingNextPage}
            onLike={() => {
              const isLiked = (post.currentUserReactions ?? []).includes('❤️') || (post.isLikedByMe ?? false);
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
            onEdit={isAuthor ? handleEdit : undefined}
            onDelete={isAuthor ? handleDeletePost : undefined}
            onTranslate={() => translateMutation.mutate({ postId: post.id, targetLanguage: userLanguage })}
            onSubmitComment={(content, parentId) =>
              createCommentMutation.mutate({ postId: post.id, content, parentId })
            }
            onLoadMoreComments={() => commentsQuery.fetchNextPage()}
            onLikeComment={(commentId) => likeCommentMutation.mutate({ postId: post.id, commentId })}
            onUnlikeComment={(commentId) => unlikeCommentMutation.mutate({ postId: post.id, commentId })}
            onDeleteComment={(commentId) => deleteCommentMutation.mutate({ postId: post.id, commentId })}
          />
        </main>

        <PostEditor
          open={editorOpen}
          initialContent={post.content ?? ''}
          initialVisibility={post.visibility}
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
