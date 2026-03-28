import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { CommentThread } from '@/components/v2/CommentThread';
import type { PostComment } from '@meeshy/shared/types/post';

jest.mock('@/components/v2/CommentItem', () => ({
  CommentItem: ({ comment }: { comment: PostComment }) => (
    <div data-testid={`reply-${comment.id}`}>{comment.content}</div>
  ),
}));

jest.mock('@/components/v2/Skeleton', () => ({
  Skeleton: () => <div data-testid="skeleton" />,
}));

const parentComment: PostComment = {
  id: 'c-parent',
  postId: 'post-1',
  authorId: 'user-1',
  content: 'Parent comment',
  likeCount: 0,
  replyCount: 3,
  createdAt: '2026-03-28T00:00:00Z',
};

const replies: PostComment[] = [
  { id: 'r-1', postId: 'post-1', authorId: 'user-2', content: 'Reply 1', likeCount: 0, replyCount: 0, createdAt: '2026-03-28T01:00:00Z' },
  { id: 'r-2', postId: 'post-1', authorId: 'user-3', content: 'Reply 2', likeCount: 1, replyCount: 0, createdAt: '2026-03-28T02:00:00Z' },
];

describe('CommentThread', () => {
  it('shows expand button when collapsed', () => {
    render(<CommentThread postId="post-1" parentComment={parentComment} replies={[]} />);
    expect(screen.getByTestId('expand-thread')).toBeInTheDocument();
    expect(screen.getByText('3 replies')).toBeInTheDocument();
  });

  it('shows "1 reply" for single reply', () => {
    const singleReply = { ...parentComment, replyCount: 1 };
    render(<CommentThread postId="post-1" parentComment={singleReply} replies={[]} />);
    expect(screen.getByText('1 reply')).toBeInTheDocument();
  });

  it('calls onLoadMore and expands on click', () => {
    const onLoadMore = jest.fn();
    render(<CommentThread postId="post-1" parentComment={parentComment} replies={replies} onLoadMore={onLoadMore} />);

    fireEvent.click(screen.getByTestId('expand-thread'));

    expect(onLoadMore).toHaveBeenCalled();
    expect(screen.getByTestId('reply-r-1')).toBeInTheDocument();
    expect(screen.getByTestId('reply-r-2')).toBeInTheDocument();
  });

  it('shows loading skeletons when expanded and loading', () => {
    render(<CommentThread postId="post-1" parentComment={parentComment} replies={[]} isLoading />);

    fireEvent.click(screen.getByTestId('expand-thread'));

    expect(screen.getByTestId('thread-loading')).toBeInTheDocument();
  });

  it('shows load more button when hasMore', () => {
    const onLoadMore = jest.fn();
    render(<CommentThread postId="post-1" parentComment={parentComment} replies={replies} hasMore onLoadMore={onLoadMore} />);

    fireEvent.click(screen.getByTestId('expand-thread'));

    expect(screen.getByTestId('load-more-replies')).toBeInTheDocument();
  });

  it('renders nothing when replyCount is 0', () => {
    const noReplies = { ...parentComment, replyCount: 0 };
    const { container } = render(<CommentThread postId="post-1" parentComment={noReplies} replies={[]} />);
    expect(container.innerHTML).toBe('');
  });
});
