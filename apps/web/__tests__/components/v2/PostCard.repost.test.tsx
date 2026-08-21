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
  likes: 3,
  comments: 1,
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

  it('renders the `↻ @handle` banner, navigable to the original', () => {
    const onTapRepost = jest.fn();
    render(<PostCard {...baseProps} repostOf={repostOf} onTapRepost={onTapRepost} />);

    expect(screen.getByText('↻')).toBeInTheDocument();
    expect(screen.getByText('@bob')).toBeInTheDocument();
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
    render(<PostCard {...baseProps} content="My own take on this" repostOf={repostOf} isQuote />);
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

  describe('counters — simple repost vs quote (controller amendment)', () => {
    it("simple repost: outer action bar shows the ORIGINAL's counts, nested counter row is absent", () => {
      render(<PostCard {...baseProps} repostOf={repostOf} />);
      expect(screen.getByText('42')).toBeInTheDocument();
      expect(screen.getByText('7')).toBeInTheDocument();
      expect(screen.queryByText('3')).not.toBeInTheDocument();
      expect(screen.queryByText('1')).not.toBeInTheDocument();
      expect(screen.queryByTestId('repost-like-count')).not.toBeInTheDocument();
      expect(screen.queryByTestId('repost-comment-count')).not.toBeInTheDocument();
    });

    it('simple repost without a repostOf count falls back to the outer prop', () => {
      render(<PostCard {...baseProps} repostOf={{ ...repostOf, likeCount: undefined as unknown as number }} />);
      expect(screen.getByText('3')).toBeInTheDocument();
    });

    it("quote: outer action bar keeps the quote's OWN counts, nested counter row shows the ORIGINAL's", () => {
      render(<PostCard {...baseProps} repostOf={repostOf} isQuote />);
      expect(screen.getByText('3')).toBeInTheDocument();
      expect(screen.getByText('1')).toBeInTheDocument();
      expect(screen.getByTestId('repost-like-count')).toHaveTextContent('42');
      expect(screen.getByTestId('repost-comment-count')).toHaveTextContent('7');
    });

    it('quote: nested view counter shows when present on repostOf', () => {
      render(<PostCard {...baseProps} repostOf={{ ...repostOf, viewCount: 99 }} isQuote />);
      expect(screen.getByTestId('repost-view-count')).toHaveTextContent('99');
    });

    it('quote: nested view counter hidden when absent on repostOf', () => {
      render(<PostCard {...baseProps} repostOf={repostOf} isQuote />);
      expect(screen.queryByTestId('repost-view-count')).not.toBeInTheDocument();
    });
  });

  describe('nested translation chip does not navigate (critical #1)', () => {
    const repostWithTranslations = {
      ...repostOf,
      translations: {
        es: { text: 'Hola desde el original' },
        fr: { text: 'Bonjour depuis l’original' },
      },
    };

    it('clicking the language chip opens the menu and does not call onTapRepost', () => {
      const onTapRepost = jest.fn();
      render(
        <PostCard {...baseProps} userLanguage="fr" repostOf={repostWithTranslations} onTapRepost={onTapRepost} />,
      );

      fireEvent.click(screen.getByText('FR'));

      expect(onTapRepost).not.toHaveBeenCalled();
      expect(screen.getByText('language.original')).toBeInTheDocument();
    });

    it('pressing a key on the language chip does not bubble into the repost navigation handler', () => {
      const onTapRepost = jest.fn();
      render(
        <PostCard {...baseProps} userLanguage="fr" repostOf={repostWithTranslations} onTapRepost={onTapRepost} />,
      );

      fireEvent.keyDown(screen.getByText('FR'), { key: 'Enter' });

      expect(onTapRepost).not.toHaveBeenCalled();
    });
  });

  // Majeur D — `repostOf.mentions` était TOUJOURS `undefined` tant que le
  // gateway ne peuplait pas `postMentions` sur `repostOf`. `PostContentText`
  // sans référence validée linkifie tout `@handle` par regex locale, y
  // compris un pseudo inexistant — le lien mort. Maintenant que le serveur
  // le peuple (postIncludes.ts `repostOfInclude.postMentions`), la chaîne
  // doit surligner UNIQUEMENT ce que le serveur a validé.
  describe("le contenu cité surligne selon les références de l'ORIGINAL", () => {
    const carol = {
      userId: 'u-carol', username: 'carol', displayName: 'Carol', avatar: null, display: 'NOTE' as const,
    };

    it('linkifie un pseudo présent dans repostOf.mentions', () => {
      render(
        <PostCard
          {...baseProps}
          repostOf={{ ...repostOf, content: 'Soirée avec @carol hier', mentions: [carol] }}
        />,
      );

      expect(screen.getByRole('link', { name: '@carol' })).toHaveAttribute('href', '/u/carol');
    });

    it("NE linkifie PAS un pseudo absent de repostOf.mentions — le lien mort que la validation existe pour supprimer", () => {
      render(
        <PostCard
          {...baseProps}
          repostOf={{ ...repostOf, content: 'Soirée avec @nimportequoi hier', mentions: [carol] }}
        />,
      );

      expect(screen.queryByRole('link', { name: '@nimportequoi' })).toBeNull();
      expect(screen.getByText(/@nimportequoi/)).toBeInTheDocument();
    });

    it("la rangée « Avec … » n'est plus structurellement vide sur le repost", () => {
      render(
        <PostCard
          {...baseProps}
          repostOf={{ ...repostOf, content: 'Une soirée mémorable', mentions: [carol] }}
        />,
      );

      expect(screen.getByText('Carol')).toBeInTheDocument();
    });
  });
});
