/**
 * Tests for PostCard's repost rendering (Task 2, point 1-2).
 * `post.repostOf` (Partial<Post>, gateway-populated) was read nowhere on web —
 * a repost of a POST/REEL rendered as an empty card. This covers the
 * "Reposted from @handle" banner + nested original card (author, content
 * with Prisme translation resolution, media incl. audio tile, counters).
 */
import { render, screen, fireEvent } from '@testing-library/react';
import { PostCard } from '@/components/v2/PostCard';

jest.mock('@/hooks/use-i18n', () => ({
  useI18n: () => ({
    t: (key: string, paramsOrFallback?: Record<string, unknown> | string) =>
      typeof paramsOrFallback === 'string' ? paramsOrFallback : key,
    tArray: () => [],
    locale: 'en',
    currentLanguage: 'en',
    setLocale: () => {},
    isLoading: false,
  }),
}));

jest.mock('@/components/v2/Avatar', () => ({
  Avatar: ({ name }: { name: string }) => <div data-testid="avatar">{name}</div>,
}));

jest.mock('@/components/v2/LanguageOrb', () => ({
  LanguageOrb: () => <span data-testid="language-orb" />,
}));

jest.mock('@/components/v2/flags', () => ({
  getLanguageName: (code: string) => code.toUpperCase(),
  getFlag: () => '🏳️',
}));

const baseProps = {
  author: { name: 'Alice' },
  lang: 'fr',
  content: '',
  time: '2h',
  likes: 0,
  comments: 0,
};

const repostOf = {
  id: 'original-1',
  author: { id: 'author-2', username: 'bob', displayName: 'Bob Original', avatar: null },
  content: 'Hello from the original',
  originalLanguage: 'en',
  likeCount: 42,
  commentCount: 7,
  media: [] as unknown[],
};

describe('PostCard — repost rendering', () => {
  it('renders no repost banner for a normal post', () => {
    render(<PostCard {...baseProps} content="Just a normal post" />);
    expect(screen.queryByTestId('post-card-repost-block')).not.toBeInTheDocument();
  });

  it('renders the "Reposted from @handle" banner, navigable to the original', () => {
    const onTapRepost = jest.fn();
    render(<PostCard {...baseProps} repostOf={repostOf} onTapRepost={onTapRepost} />);

    expect(screen.getByText('Reposted from @bob')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('post-card-repost-block'));
    expect(onTapRepost).toHaveBeenCalledWith('original-1');
  });

  it('renders the original author, content and translation resolution (never translations.first)', () => {
    render(
      <PostCard
        {...baseProps}
        userLanguage="fr"
        repostOf={{
          ...repostOf,
          translations: {
            es: { text: 'Hola desde el original' },
            fr: { text: 'Bonjour depuis l’original' },
          },
        }}
      />,
    );

    expect(screen.getByText('Bob Original')).toBeInTheDocument();
    expect(screen.getByText('Bonjour depuis l’original')).toBeInTheDocument();
    expect(screen.queryByText('Hola desde el original')).not.toBeInTheDocument();
  });

  it('falls back to the original content when no translation matches the preferred language', () => {
    render(
      <PostCard
        {...baseProps}
        userLanguage="de"
        repostOf={{ ...repostOf, translations: { es: { text: 'Hola desde el original' } } }}
      />,
    );
    expect(screen.getByText('Hello from the original')).toBeInTheDocument();
  });

  it('shows the reposter comment above the nested card for a quote', () => {
    render(<PostCard {...baseProps} content="My own take on this" repostOf={repostOf} />);
    expect(screen.getByText('My own take on this')).toBeInTheDocument();
    expect(screen.getByText('Hello from the original')).toBeInTheDocument();
  });

  it("renders the original's media grid, including an audio tile", () => {
    render(
      <PostCard
        {...baseProps}
        repostOf={{
          ...repostOf,
          media: [
            { id: 'm-1', mimeType: 'image/jpeg', fileUrl: 'https://example.com/img.jpg', alt: 'A photo' },
            { id: 'm-2', mimeType: 'audio/webm', fileUrl: 'https://example.com/clip.webm', duration: 42 },
          ],
        }}
      />,
    );
    expect(screen.getByAltText('A photo')).toBeInTheDocument();
    expect(screen.getByTestId('post-card-repost-audio-tile')).toBeInTheDocument();
  });

  it("shows the original's like/comment counters", () => {
    render(<PostCard {...baseProps} repostOf={repostOf} />);
    expect(screen.getByTestId('repost-like-count')).toHaveTextContent('42');
    expect(screen.getByTestId('repost-comment-count')).toHaveTextContent('7');
  });

  it('hides the view counter when absent on repostOf', () => {
    render(<PostCard {...baseProps} repostOf={repostOf} />);
    expect(screen.queryByTestId('repost-view-count')).not.toBeInTheDocument();
  });

  it('shows the view counter when present on repostOf (post-Task-1 gateway field)', () => {
    render(<PostCard {...baseProps} repostOf={{ ...repostOf, viewCount: 99 }} />);
    expect(screen.getByTestId('repost-view-count')).toHaveTextContent('99');
  });

  it("downloads the original's media through onDownloadRepostMedia (not onDownloadMedia)", () => {
    const onDownloadMedia = jest.fn();
    const onDownloadRepostMedia = jest.fn();
    const clickSpy = jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    render(
      <PostCard
        {...baseProps}
        repostOf={{
          ...repostOf,
          media: [{ id: 'm-1', mimeType: 'image/jpeg', fileUrl: 'https://example.com/img.jpg', alt: 'A photo' }],
        }}
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
