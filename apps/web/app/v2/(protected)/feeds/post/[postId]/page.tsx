'use client';

import { useParams, useRouter } from 'next/navigation';
import { usePostQuery } from '@/hooks/queries/use-post-query';
import { useCommentsInfiniteQuery, useCommentsList } from '@/hooks/queries/use-comments-query';
import { useLikePostMutation, useUnlikePostMutation, useBookmarkPostMutation, useUnbookmarkPostMutation, useDeletePostMutation, useSharePostMutation } from '@/hooks/queries/use-post-mutations';
import { useCreateCommentMutation, useDeleteCommentMutation, useLikeCommentMutation, useUnlikeCommentMutation } from '@/hooks/queries/use-comment-mutations';
import { usePostSocketCacheSync } from '@/hooks/queries/use-post-socket-cache-sync';
import { PostDetail } from '@/components/v2/PostDetail';
import { PageHeader } from '@/components/v2';
import { Skeleton } from '@/components/v2/Skeleton';
import { useAuthStore } from '@/stores/auth-store';

export default function PostDetailPage() {
  const params = useParams();
  const router = useRouter();
  const postId = params.postId as string;

  const currentUser = useAuthStore((s) => s.user);

  const postQuery = usePostQuery(postId);
  const commentsQuery = useCommentsInfiniteQuery({ postId, enabled: !!postId });
  const comments = useCommentsList(commentsQuery);

  usePostSocketCacheSync();

  const likeMutation = useLikePostMutation();
  const unlikeMutation = useUnlikePostMutation();
  const bookmarkMutation = useBookmarkPostMutation();
  const unbookmarkMutation = useUnbookmarkPostMutation();
  const deleteMutation = useDeletePostMutation();
  const shareMutation = useSharePostMutation();
  const createCommentMutation = useCreateCommentMutation();
  const deleteCommentMutation = useDeleteCommentMutation();
  const likeCommentMutation = useLikeCommentMutation();
  const unlikeCommentMutation = useUnlikeCommentMutation();

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

  const handleShare = async () => {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/v2/feeds/post/${post.id}`);
      shareMutation.mutate({ postId: post.id });
    } catch { /* silent */ }
  };

  const handleDeletePost = () => {
    deleteMutation.mutate(post.id, {
      onSuccess: () => router.back(),
    });
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
          commentsLoading={commentsQuery.isLoading}
          commentsHasMore={commentsQuery.hasNextPage ?? false}
          commentsLoadingMore={commentsQuery.isFetchingNextPage}
          onLike={() => likeMutation.mutate({ postId: post.id })}
          onUnlike={() => unlikeMutation.mutate(post.id)}
          onBookmark={() => bookmarkMutation.mutate(post.id)}
          onUnbookmark={() => unbookmarkMutation.mutate(post.id)}
          onShare={handleShare}
          onDelete={post.authorId === currentUser?.id ? handleDeletePost : undefined}
          onSubmitComment={(content, parentId) =>
            createCommentMutation.mutate({ postId: post.id, content, parentId })
          }
          onLoadMoreComments={() => commentsQuery.fetchNextPage()}
          onLikeComment={(commentId) => likeCommentMutation.mutate({ postId: post.id, commentId })}
          onUnlikeComment={(commentId) => unlikeCommentMutation.mutate({ postId: post.id, commentId })}
          onDeleteComment={(commentId) => deleteCommentMutation.mutate({ postId: post.id, commentId })}
        />
      </main>
    </div>
  );
}
