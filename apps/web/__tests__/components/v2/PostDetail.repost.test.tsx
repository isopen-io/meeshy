/**
 * Tests for PostDetail's repost rendering (Task 2, point 3).
 * Mirrors PostCard.repost.test.tsx — same nested-card contract for the
 * detail page: "Reposted from @handle" banner + original author/content
 * (Prisme resolution)/media (incl. audio tile)/counters.
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
    content: '',
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

const repostOf = {
  id: 'original-1',
  author: { id: 'author-2', username: 'bob', displayName: 'Bob Original', avatar: null },
  content: 'Hello from the original',
  originalLanguage: 'en',
  likeCount: 42,
  commentCount: 7,
  media: [] as unknown[],
};

describe('PostDetail — repost rendering', () => {
  it('renders no repost banner for a normal post', () => {
    render(<PostDetail post={makePost({ content: 'Just a normal post' })} comments={[]} />);
    expect(screen.queryByTestId('post-detail-repost-block')).not.toBeInTheDocument();
  });

  it('renders the "Reposted from @handle" banner, navigable to the original', () => {
    const onTapRepost = jest.fn();
    render(<PostDetail post={makePost({ repostOf })} comments={[]} onTapRepost={onTapRepost} />);

    expect(screen.getByText('Reposted from @bob')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('post-detail-repost-block'));
    expect(onTapRepost).toHaveBeenCalledWith('original-1');
  });

  it('renders the original author, content and translation resolution (never translations.first)', () => {
    render(
      <PostDetail
        post={makePost({
          repostOf: {
            ...repostOf,
            translations: {
              es: { text: 'Hola desde el original' },
              fr: { text: 'Bonjour depuis l’original' },
            },
          },
        })}
        comments={[]}
        userLanguage="fr"
      />,
    );

    expect(screen.getByText('Bob Original')).toBeInTheDocument();
    expect(screen.getByText('Bonjour depuis l’original')).toBeInTheDocument();
    expect(screen.queryByText('Hola desde el original')).not.toBeInTheDocument();
  });

  it('falls back to the original content when no translation matches the preferred language', () => {
    render(
      <PostDetail
        post={makePost({ repostOf: { ...repostOf, translations: { es: { text: 'Hola desde el original' } } } })}
        comments={[]}
        userLanguage="de"
      />,
    );
    expect(screen.getByText('Hello from the original')).toBeInTheDocument();
  });

  it('shows the reposter comment above the nested card for a quote', () => {
    render(<PostDetail post={makePost({ content: 'My own take on this', repostOf, isQuote: true })} comments={[]} />);
    expect(screen.getByText('My own take on this')).toBeInTheDocument();
    expect(screen.getByText('Hello from the original')).toBeInTheDocument();
  });

  it("renders the original's media grid, including an audio tile", () => {
    render(
      <PostDetail
        post={makePost({
          repostOf: {
            ...repostOf,
            media: [
              { id: 'm-1', mimeType: 'image/jpeg', fileUrl: 'https://example.com/img.jpg', alt: 'A photo' },
              { id: 'm-2', mimeType: 'audio/webm', fileUrl: 'https://example.com/clip.webm', duration: 42 },
            ],
          },
        })}
        comments={[]}
      />,
    );
    expect(screen.getByAltText('A photo')).toBeInTheDocument();
    expect(screen.getByTestId('post-detail-repost-audio-tile')).toBeInTheDocument();
  });

  it("shows the original's like/comment counters", () => {
    render(<PostDetail post={makePost({ repostOf })} comments={[]} />);
    expect(screen.getByTestId('repost-like-count')).toHaveTextContent('42');
    expect(screen.getByTestId('repost-comment-count')).toHaveTextContent('7');
  });

  it('hides the view counter when absent on repostOf', () => {
    render(<PostDetail post={makePost({ repostOf })} comments={[]} />);
    expect(screen.queryByTestId('repost-view-count')).not.toBeInTheDocument();
  });

  it('shows the view counter when present on repostOf (post-Task-1 gateway field)', () => {
    render(<PostDetail post={makePost({ repostOf: { ...repostOf, viewCount: 99 } })} comments={[]} />);
    expect(screen.getByTestId('repost-view-count')).toHaveTextContent('99');
  });

  it("downloads the original's media through onDownloadRepostMedia (not onDownloadMedia)", () => {
    const onDownloadMedia = jest.fn();
    const onDownloadRepostMedia = jest.fn();
    const clickSpy = jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    render(
      <PostDetail
        post={makePost({
          repostOf: {
            ...repostOf,
            media: [{ id: 'm-1', mimeType: 'image/jpeg', fileUrl: 'https://example.com/img.jpg', alt: 'A photo' }],
          },
        })}
        comments={[]}
        onDownloadMedia={onDownloadMedia}
        onDownloadRepostMedia={onDownloadRepostMedia}
      />,
    );

    fireEvent.click(screen.getByLabelText('Download original media'));
    expect(onDownloadRepostMedia).toHaveBeenCalledWith('m-1');
    expect(onDownloadMedia).not.toHaveBeenCalled();
    clickSpy.mockRestore();
  });
});
