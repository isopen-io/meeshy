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
import { useCreateCommentMutation, useDeleteCommentMutation, useLikeCommentMutation, useUnlikeCommentMutation } from '@/hooks/queries/use-comment-mutations';
import { usePostSocketCacheSync } from '@/hooks/queries/use-post-socket-cache-sync';
import { usePreferredLanguage } from '@/hooks/use-post-translation';
import { PostDetail } from '@/components/v2/PostDetail';
import { PostEditor } from '@/components/v2/PostEditor';
import { RepostModal } from '@/components/v2/RepostModal';
import { PageHeader, useToast } from '@/components/v2';
import { Skeleton } from '@/components/v2/Skeleton';
import { useAuthStore } from '@/stores/auth-store';
import { postsService } from '@/services/posts.service';

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
  const userLanguage = usePreferredLanguage();

  const postQuery = usePostQuery(postId);
  const commentsQuery = useCommentsInfiniteQuery({ postId, enabled: !!postId });
  const comments = useCommentsList(commentsQuery);

  usePostSocketCacheSync();

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

  // Editor state
  const [editorOpen, setEditorOpen] = useState(false);
  const [repostModalOpen, setRepostModalOpen] = useState(false);

  // View tracking — record view on mount
  useEffect(() => {
    if (postId) {
      postsService.viewPost(postId).catch(() => {});
    }
  }, [postId]);

  if (postQuery.isLoading) {
    return (
      <div className="h-full overflow-auto bg-[var(--gp-background)] transition-colors">
        <PageHeader title="Post" onBack={() => router.back()} />
        <div className="max-w-2xl mx-auto px-6 py-8 space-y-4">
          <Skeleton className="h-48 rounded-2xl" />
          <Skeleton className="h-32 rounded-2xl" />
        </div>
      </div>
    );
  }

  if (postQuery.isError || !postQuery.data) {
    return (
      <div className="h-full overflow-auto bg-[var(--gp-background)] transition-colors">
        <PageHeader title="Post" onBack={() => router.back()} />
        <div className="max-w-2xl mx-auto px-6 py-16 text-center">
          <p className="text-[var(--gp-text-muted)]">Post not found or an error occurred.</p>
        </div>
      </div>
    );
  }

  const post = postQuery.data;
  const isAuthor = post.authorId === currentUser?.id;

  const handleShare = async () => {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/v2/feeds/post/${post.id}`);
      shareMutation.mutate({ postId: post.id });
      showToast('Link copied!', 'success');
    } catch { /* silent */ }
  };

  const handleDeletePost = () => {
    deleteMutation.mutate(post.id, {
      onSuccess: () => router.back(),
    });
  };

  const handleEdit = () => setEditorOpen(true);

  const handleSaveEdit = (data: { content: string; visibility: string }) => {
    updateMutation.mutate(
      { postId: post.id, data: { content: data.content, visibility: data.visibility as 'PUBLIC' | 'FRIENDS' | 'PRIVATE' } },
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
    <div className="h-full overflow-auto bg-[var(--gp-background)] transition-colors">
      <PageHeader title="Post" onBack={() => router.back()} />
      <main className="px-6 py-8">
        <PostDetail
          post={post}
          comments={comments}
          currentUserId={currentUser?.id}
          currentUser={currentUser ? { username: currentUser.username, avatar: currentUser.avatar } : null}
          userLanguage={userLanguage}
          commentsLoading={commentsQuery.isLoading}
          commentsHasMore={commentsQuery.hasNextPage ?? false}
          commentsLoadingMore={commentsQuery.isFetchingNextPage}
          onLike={() => likeMutation.mutate({ postId: post.id })}
          onUnlike={() => unlikeMutation.mutate(post.id)}
          onBookmark={() => bookmarkMutation.mutate(post.id)}
          onUnbookmark={() => unbookmarkMutation.mutate(post.id)}
          onShare={handleShare}
          onEdit={isAuthor ? handleEdit : undefined}
          onDelete={isAuthor ? handleDeletePost : undefined}
          onSubmitComment={(content, parentId) =>
            createCommentMutation.mutate({ postId: post.id, content, parentId })
          }
          onLoadMoreComments={() => commentsQuery.fetchNextPage()}
          onLikeComment={(commentId) => likeCommentMutation.mutate({ postId: post.id, commentId })}
          onUnlikeComment={(commentId) => unlikeCommentMutation.mutate({ postId: post.id, commentId })}
          onDeleteComment={(commentId) => deleteCommentMutation.mutate({ postId: post.id, commentId })}
        />
      </main>

      {/* Post Editor */}
      <PostEditor
        open={editorOpen}
        initialContent={post.content ?? ''}
        initialVisibility={post.visibility}
        onSave={handleSaveEdit}
        onClose={() => setEditorOpen(false)}
        saving={updateMutation.isPending}
      />

      {/* Repost Modal */}
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
  );
}
