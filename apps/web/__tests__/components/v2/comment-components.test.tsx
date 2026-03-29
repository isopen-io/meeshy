import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { CommentItem } from '@/components/v2/CommentItem';
import { CommentComposer } from '@/components/v2/CommentComposer';
import { CommentList } from '@/components/v2/CommentList';
import type { PostComment } from '@meeshy/shared/types/post';

// Mock Avatar and TranslationToggle to avoid complex deps
jest.mock('@/components/v2/Avatar', () => ({
  Avatar: ({ name }: { name: string }) => <div data-testid="avatar">{name}</div>,
}));

jest.mock('@/components/v2/TranslationToggle', () => ({
  TranslationToggle: ({ originalContent }: { originalContent: string }) => (
    <div data-testid="translation-toggle">{originalContent}</div>
  ),
}));

jest.mock('@/components/v2/Skeleton', () => ({
  Skeleton: ({ className }: { className?: string }) => <div data-testid="skeleton" className={className} />,
}));

const mockComment: PostComment = {
  id: 'comment-1',
  postId: 'post-1',
  authorId: 'user-2',
  parentId: null,
  content: 'Great post!',
  originalLanguage: 'en',
  likeCount: 3,
  replyCount: 2,
  createdAt: new Date(Date.now() - 3600000).toISOString(),
  author: { id: 'user-2', username: 'john', displayName: 'John Doe', avatar: null },
};

const mockComment2: PostComment = {
  id: 'comment-2',
  postId: 'post-1',
  authorId: 'user-3',
  parentId: null,
  content: 'Nice work!',
  likeCount: 0,
  replyCount: 0,
  createdAt: new Date(Date.now() - 7200000).toISOString(),
  author: { id: 'user-3', username: 'jane' },
};

// ── CommentItem ─────────────────────────────────────────────────────────

describe('CommentItem', () => {
  it('renders comment content and author', () => {
    render(<CommentItem comment={mockComment} />);
    expect(screen.getByText('Great post!')).toBeInTheDocument();
    expect(screen.getByText('John Doe')).toBeInTheDocument();
  });

  it('displays like count when > 0', () => {
    render(<CommentItem comment={mockComment} />);
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('displays reply count', () => {
    render(<CommentItem comment={mockComment} />);
    expect(screen.getByText('2 replies')).toBeInTheDocument();
  });

  it('displays "1 reply" for single reply', () => {
    render(<CommentItem comment={{ ...mockComment, replyCount: 1 }} />);
    expect(screen.getByText('1 reply')).toBeInTheDocument();
  });

  it('calls onLike when clicking like button', () => {
    const onLike = jest.fn();
    render(<CommentItem comment={mockComment} onLike={onLike} />);
    fireEvent.click(screen.getByLabelText('Like comment'));
    expect(onLike).toHaveBeenCalledWith('comment-1');
  });

  it('calls onUnlike when already liked', () => {
    const onUnlike = jest.fn();
    render(<CommentItem comment={mockComment} isLiked onUnlike={onUnlike} />);
    fireEvent.click(screen.getByLabelText('Unlike comment'));
    expect(onUnlike).toHaveBeenCalledWith('comment-1');
  });

  it('calls onReply when clicking Reply', () => {
    const onReply = jest.fn();
    render(<CommentItem comment={mockComment} onReply={onReply} />);
    fireEvent.click(screen.getByText('Reply'));
    expect(onReply).toHaveBeenCalledWith('comment-1');
  });

  it('shows delete button for author on hover', () => {
    const onDelete = jest.fn();
    render(<CommentItem comment={mockComment} isAuthor onDelete={onDelete} />);

    const item = screen.getByTestId('comment-item-comment-1');
    fireEvent.mouseEnter(item);

    const deleteBtn = screen.getByLabelText('Delete comment');
    fireEvent.click(deleteBtn);
    expect(onDelete).toHaveBeenCalledWith('comment-1');
  });

  it('hides delete button for non-author', () => {
    render(<CommentItem comment={mockComment} isAuthor={false} />);
    expect(screen.queryByLabelText('Delete comment')).not.toBeInTheDocument();
  });
});

// ── CommentComposer ─────────────────────────────────────────────────────

describe('CommentComposer', () => {
  it('renders textarea and submit button', () => {
    render(<CommentComposer postId="post-1" onSubmit={jest.fn()} />);
    expect(screen.getByLabelText('Comment input')).toBeInTheDocument();
    expect(screen.getByLabelText('Send comment')).toBeInTheDocument();
  });

  it('calls onSubmit with content on Enter', () => {
    const onSubmit = jest.fn();
    render(<CommentComposer postId="post-1" onSubmit={onSubmit} />);

    const textarea = screen.getByLabelText('Comment input');
    fireEvent.change(textarea, { target: { value: 'Hello!' } });
    fireEvent.keyDown(textarea, { key: 'Enter' });

    expect(onSubmit).toHaveBeenCalledWith('Hello!', undefined);
  });

  it('does not submit empty content', () => {
    const onSubmit = jest.fn();
    render(<CommentComposer postId="post-1" onSubmit={onSubmit} />);

    const textarea = screen.getByLabelText('Comment input');
    fireEvent.keyDown(textarea, { key: 'Enter' });

    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('clears input after submit', () => {
    const onSubmit = jest.fn();
    render(<CommentComposer postId="post-1" onSubmit={onSubmit} />);

    const textarea = screen.getByLabelText('Comment input') as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: 'Hello!' } });
    fireEvent.keyDown(textarea, { key: 'Enter' });

    expect(textarea.value).toBe('');
  });

  it('shows reply indicator when parentId is set', () => {
    render(
      <CommentComposer postId="post-1" parentId="c-1" parentAuthor="John" onSubmit={jest.fn()} />,
    );
    expect(screen.getByText('John')).toBeInTheDocument();
    expect(screen.getByLabelText('Reply input')).toBeInTheDocument();
  });

  it('calls onCancelReply', () => {
    const onCancel = jest.fn();
    render(
      <CommentComposer postId="post-1" parentId="c-1" parentAuthor="John" onSubmit={jest.fn()} onCancelReply={onCancel} />,
    );
    fireEvent.click(screen.getByLabelText('Cancel reply'));
    expect(onCancel).toHaveBeenCalled();
  });
});

// ── CommentList ─────────────────────────────────────────────────────────

describe('CommentList', () => {
  it('renders loading skeletons', () => {
    render(<CommentList postId="post-1" comments={[]} isLoading />);
    expect(screen.getByTestId('comments-loading')).toBeInTheDocument();
  });

  it('renders empty state', () => {
    render(<CommentList postId="post-1" comments={[]} />);
    expect(screen.getByTestId('comments-empty')).toBeInTheDocument();
    expect(screen.getByText(/No comments yet/)).toBeInTheDocument();
  });

  it('renders list of comments', () => {
    render(<CommentList postId="post-1" comments={[mockComment, mockComment2]} />);
    expect(screen.getByText('Great post!')).toBeInTheDocument();
    expect(screen.getByText('Nice work!')).toBeInTheDocument();
  });

  it('shows load more button when hasMore', () => {
    const onLoadMore = jest.fn();
    render(
      <CommentList postId="post-1" comments={[mockComment]} hasMore onLoadMore={onLoadMore} />,
    );
    const btn = screen.getByTestId('load-more-comments');
    fireEvent.click(btn);
    expect(onLoadMore).toHaveBeenCalled();
  });

  it('shows composer when onSubmitComment is provided', () => {
    render(
      <CommentList postId="post-1" comments={[]} onSubmitComment={jest.fn()} />,
    );
    expect(screen.getByTestId('comment-composer')).toBeInTheDocument();
  });

  it('hides composer when onSubmitComment is not provided', () => {
    render(<CommentList postId="post-1" comments={[]} />);
    expect(screen.queryByTestId('comment-composer')).not.toBeInTheDocument();
  });
});
