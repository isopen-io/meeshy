/**
 * Tests for ReelPlayer's repost-aware rendering (chantier reposts &
 * watermark, Task 3). A reposted REEL carries no media/content of its own —
 * the gateway only snapshots ephemeral types (STORY/STATUS) into `repostOf`
 * on repost, REEL stays a bare pointer. The player must fall back to
 * `post.repostOf` for media, caption and displayed counters, mirroring the
 * iOS `primaryReelDisplayMedia` fallback (ReelFeedCard.swift:118-145).
 */
import { render, screen } from '@testing-library/react';
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
    id: 'repost-1',
    authorId: 'reposter-1',
    type: 'REEL',
    visibility: 'PUBLIC',
    content: null,
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
    media: [],
    author: { id: 'reposter-1', username: 'reposter' },
    ...overrides,
  } as Post;
}

function makeRepostOf(overrides: Partial<Post> = {}): Partial<Post> {
  return {
    id: 'original-1',
    content: 'Original caption',
    likeCount: 100,
    commentCount: 50,
    author: { id: 'original-author', username: 'original_author', displayName: 'Original Author' },
    media: [{ id: 'orig-media-1', mimeType: 'video/mp4', fileUrl: 'https://example.com/original.mp4', order: 0 }],
    ...overrides,
  };
}

const noop = () => {};

function renderPlayer(reel: Post, userLanguage?: string) {
  return render(
    <ReelPlayer
      reel={reel}
      index={0}
      total={1}
      hasPrev={false}
      hasNext={false}
      isLiked={false}
      isBookmarked={false}
      userLanguage={userLanguage}
      onPrev={noop}
      onNext={noop}
      onClose={noop}
      onLike={noop}
      onComment={noop}
      onShare={noop}
      onBookmark={noop}
    />
  );
}

describe('ReelPlayer — reposted reel', () => {
  it('renders the original video when the reel has no media of its own', () => {
    const reel = makePost({ repostOf: makeRepostOf() });
    const { container } = renderPlayer(reel);
    const video = container.querySelector('video');
    expect(video).toHaveAttribute('src', 'https://example.com/original.mp4');
  });

  it('does not show the placeholder gradient for a reposted reel', () => {
    const reel = makePost({ repostOf: makeRepostOf() });
    const { container } = renderPlayer(reel);
    expect(container.querySelector('[class*="from-indigo-700"]')).not.toBeInTheDocument();
  });

  it('keeps using its own media when the reel already carries media', () => {
    const reel = makePost({
      media: [{ id: 'own-media', mimeType: 'video/mp4', fileUrl: 'https://example.com/own.mp4', order: 0 }],
      repostOf: makeRepostOf(),
    });
    const { container } = renderPlayer(reel);
    const video = container.querySelector('video');
    expect(video).toHaveAttribute('src', 'https://example.com/own.mp4');
  });

  it('resolves the caption from the original when the repost has no content of its own', () => {
    const reel = makePost({ content: null, repostOf: makeRepostOf({ content: 'Original caption' }) });
    renderPlayer(reel);
    expect(screen.getByText('Original caption')).toBeInTheDocument();
  });

  it('prioritizes the reposter content for a quote repost', () => {
    const reel = makePost({
      content: 'My take on this',
      isQuote: true,
      repostOf: makeRepostOf({ content: 'Original caption' }),
    });
    renderPlayer(reel);
    expect(screen.getByText('My take on this')).toBeInTheDocument();
    expect(screen.queryByText('Original caption')).not.toBeInTheDocument();
  });

  it('never falls back to an arbitrary translation when the preferred language has no match', () => {
    const reel = makePost({
      content: null,
      repostOf: makeRepostOf({
        content: 'Original caption',
        translations: { es: { text: 'Subtitulo original' } },
      }),
    });
    renderPlayer(reel, 'de');
    expect(screen.getByText('Original caption')).toBeInTheDocument();
  });

  it('shows a discreet "Reposted from" banner linking to the original', () => {
    const reel = makePost({ repostOf: makeRepostOf({ id: 'original-1' }) });
    renderPlayer(reel);
    const link = screen.getByRole('link', { name: /Reposted from/i });
    expect(link).toHaveAttribute('href', '/reel/original-1');
    expect(link).toHaveTextContent('@original_author');
  });

  it('does not show a repost banner for a normal (non-reposted) reel', () => {
    const reel = makePost({
      content: 'Just a normal reel',
      media: [{ id: 'own-media', mimeType: 'video/mp4', fileUrl: 'https://example.com/own.mp4', order: 0 }],
    });
    renderPlayer(reel);
    expect(screen.queryByText(/Reposted from/)).not.toBeInTheDocument();
  });

  it('displays the original counters when the reel is a repost', () => {
    const reel = makePost({
      likeCount: 3,
      commentCount: 1,
      repostOf: makeRepostOf({ likeCount: 999, commentCount: 444 }),
    });
    renderPlayer(reel);
    expect(screen.getByLabelText('Like')).toHaveTextContent('999');
    expect(screen.getByLabelText('Comment')).toHaveTextContent('444');
  });

  it('falls back to its own counters when the original does not carry the field yet', () => {
    const reel = makePost({
      likeCount: 3,
      commentCount: 1,
      repostOf: makeRepostOf({ likeCount: undefined, commentCount: undefined }),
    });
    renderPlayer(reel);
    expect(screen.getByLabelText('Like')).toHaveTextContent('3');
    expect(screen.getByLabelText('Comment')).toHaveTextContent('1');
  });

  it('leaves a normal reel unchanged', () => {
    const reel = makePost({
      content: 'Just a normal reel',
      likeCount: 5,
      commentCount: 2,
      media: [{ id: 'own-media', mimeType: 'video/mp4', fileUrl: 'https://example.com/own.mp4', order: 0 }],
    });
    const { container } = renderPlayer(reel);
    expect(screen.getByText('Just a normal reel')).toBeInTheDocument();
    expect(screen.getByLabelText('Like')).toHaveTextContent('5');
    expect(screen.getByLabelText('Comment')).toHaveTextContent('2');
    expect(container.querySelector('video')).toHaveAttribute('src', 'https://example.com/own.mp4');
  });
});
