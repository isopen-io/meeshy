/**
 * Tests for ReelPlayer's media download action (Task 4, point 3).
 * Reuses the `<a download>` pattern from the chat lightboxes.
 */
import { render, screen, fireEvent } from '@testing-library/react';
import { ReelPlayer } from '@/components/feed/ReelPlayer';
import type { Post } from '@meeshy/shared/types/post';

jest.mock('@/hooks/use-i18n', () => ({
  useI18n: () => ({
    t: (key: string, paramsOrFallback?: Record<string, unknown> | string) =>
      typeof paramsOrFallback === 'string' ? paramsOrFallback : key,
  }),
}));

function makePost(overrides: Partial<Post> = {}): Post {
  return {
    id: 'reel-1',
    authorId: 'user-1',
    type: 'REEL',
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
    media: [{ id: 'media-1', mimeType: 'video/mp4', fileUrl: 'https://example.com/clip.mp4', order: 0 }],
    ...overrides,
  } as Post;
}

const noop = () => {};

function renderPlayer(onDownload?: (mediaId: string) => void) {
  return render(
    <ReelPlayer
      reel={makePost()}
      index={0}
      total={1}
      hasPrev={false}
      hasNext={false}
      isLiked={false}
      isBookmarked={false}
      onPrev={noop}
      onNext={noop}
      onClose={noop}
      onLike={noop}
      onComment={noop}
      onShare={noop}
      onBookmark={noop}
      onDownload={onDownload}
    />
  );
}

describe('ReelPlayer — media download', () => {
  it('shows a Download button when onDownload is provided', () => {
    renderPlayer(jest.fn());
    expect(screen.getByLabelText('Download')).toBeInTheDocument();
  });

  it('triggers a download and calls onDownload with the media id', () => {
    const onDownload = jest.fn();
    const clickSpy = jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    renderPlayer(onDownload);

    fireEvent.click(screen.getByLabelText('Download'));

    expect(clickSpy).toHaveBeenCalled();
    expect(onDownload).toHaveBeenCalledWith('media-1');
    clickSpy.mockRestore();
  });

  it('does not show Download without an onDownload handler', () => {
    renderPlayer(undefined);
    expect(screen.queryByLabelText('Download')).not.toBeInTheDocument();
  });
});
