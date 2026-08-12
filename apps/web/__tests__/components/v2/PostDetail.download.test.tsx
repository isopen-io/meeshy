/**
 * Tests for PostDetail's media download action (Task 4, point 3).
 * Reuses the `<a download>` pattern from the chat lightboxes
 * (ImageLightbox/VideoLightbox) plus a best-effort `onDownloadMedia` callback
 * for the host page to ping analytics with the correct postId.
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
    media: [{ id: 'media-1', mimeType: 'image/jpeg', fileUrl: 'https://example.com/img.jpg', order: 0, alt: 'A photo' }],
    ...overrides,
  } as Post;
}

describe('PostDetail — media download', () => {
  it('triggers a download and calls onDownloadMedia with the media id', () => {
    const onDownloadMedia = jest.fn();
    const clickSpy = jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    render(<PostDetail post={makePost()} comments={[]} currentUserId="viewer-1" onDownloadMedia={onDownloadMedia} />);

    fireEvent.click(screen.getByLabelText('Download'));

    expect(clickSpy).toHaveBeenCalled();
    expect(onDownloadMedia).toHaveBeenCalledWith('media-1');
    clickSpy.mockRestore();
  });

  it('does not render a download button without onDownloadMedia', () => {
    render(<PostDetail post={makePost()} comments={[]} currentUserId="viewer-1" />);
    expect(screen.queryByLabelText('Download')).not.toBeInTheDocument();
  });
});
