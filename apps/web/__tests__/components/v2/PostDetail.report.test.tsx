/**
 * Tests for PostDetail's Report action (Task 3, point 2 follow-up).
 * reportPost/reportStory services exist (report.service.ts) but had no UI
 * entry point anywhere. This wires a Report button for non-author viewers.
 */
import { render, screen, fireEvent } from '@testing-library/react';
import { PostDetail } from '@/components/v2/PostDetail';
import type { Post } from '@meeshy/shared/types/post';

function makePost(overrides: Partial<Post> = {}): Post {
  return {
    id: 'post-1',
    authorId: 'author-1',
    type: 'POST',
    visibility: 'PUBLIC',
    content: 'Hello',
    likeCount: 0,
    commentCount: 0,
    repostCount: 0,
    viewCount: 0,
    bookmarkCount: 0,
    shareCount: 0,
    isPinned: false,
    isEdited: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  } as Post;
}

describe('PostDetail — report action', () => {
  it('shows a Report button for a viewer who is not the author', () => {
    const onReport = jest.fn();
    render(
      <PostDetail post={makePost()} comments={[]} currentUserId="viewer-1" onReport={onReport} />,
    );
    expect(screen.getByLabelText('Report post')).toBeInTheDocument();
  });

  it('calls onReport when clicked', () => {
    const onReport = jest.fn();
    render(
      <PostDetail post={makePost()} comments={[]} currentUserId="viewer-1" onReport={onReport} />,
    );
    fireEvent.click(screen.getByLabelText('Report post'));
    expect(onReport).toHaveBeenCalled();
  });

  it('does not show Report on the author own post', () => {
    render(
      <PostDetail post={makePost()} comments={[]} currentUserId="author-1" onReport={jest.fn()} />,
    );
    expect(screen.queryByLabelText('Report post')).not.toBeInTheDocument();
  });

  it('does not show Report without an onReport handler', () => {
    render(<PostDetail post={makePost()} comments={[]} currentUserId="viewer-1" />);
    expect(screen.queryByLabelText('Report post')).not.toBeInTheDocument();
  });
});
