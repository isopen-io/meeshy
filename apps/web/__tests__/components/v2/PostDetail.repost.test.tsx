/**
 * Tests for PostDetail's repost rendering (Task 2, point 3).
 * Mirrors PostCard.repost.test.tsx — same nested-card contract for the
 * detail page: "Reposted from @handle" banner + original author/content
 * (Prisme resolution)/media (incl. audio tile)/counters.
 */
import { render, screen, fireEvent } from '@testing-library/react';
import { PostDetail } from '@/components/v2/PostDetail';
import { getLanguageName } from '@/components/v2/flags';
import type { Post } from '@meeshy/shared/types/post';

function makePost(overrides: Partial<Post> = {}): Post {
  return {
    id: 'post-1',
    authorId: 'author-1',
    type: 'POST',
    visibility: 'PUBLIC',
    content: '',
    likeCount: 3,
    commentCount: 1,
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

  /**
   * L'ancrage est un SECOND geste, rendu à côté du repost, et jamais décidé
   * par la carte : c'est l'hôte qui sait si le miroir mènerait à de
   * l'éphémère. Jumeau de `StoryViewer` (`onRepostAsPost`).
   */
  describe("l'ancrage — « garder ça pour de bon »", () => {
    it("rend le bouton d'ancrage quand l'hôte le câble", () => {
      const onRepostAsPost = jest.fn();
      render(
        <PostDetail post={makePost()} comments={[]} onRepost={jest.fn()} onRepostAsPost={onRepostAsPost} />,
      );

      fireEvent.click(screen.getByTestId('post-detail-repost-as-post'));
      expect(onRepostAsPost).toHaveBeenCalledTimes(1);
    });

    it("ne rend rien quand l'hôte ne le câble pas — un post est déjà son propre ancrage", () => {
      render(<PostDetail post={makePost()} comments={[]} onRepost={jest.fn()} />);
      expect(screen.queryByTestId('post-detail-repost-as-post')).not.toBeInTheDocument();
    });
  });

  describe('counters — simple repost vs quote (controller amendment)', () => {
    it("simple repost: outer stats bar shows the ORIGINAL's counts, nested counter row is absent", () => {
      render(<PostDetail post={makePost({ repostOf })} comments={[]} />);
      expect(screen.getByText('42 likes')).toBeInTheDocument();
      expect(screen.getByText('7 comments')).toBeInTheDocument();
      expect(screen.queryByText('3 likes')).not.toBeInTheDocument();
      expect(screen.queryByText('1 comments')).not.toBeInTheDocument();
      expect(screen.queryByTestId('repost-like-count')).not.toBeInTheDocument();
      expect(screen.queryByTestId('repost-comment-count')).not.toBeInTheDocument();
    });

    it('simple repost: outer stats bar shows the ORIGINAL view count too, when present', () => {
      render(<PostDetail post={makePost({ repostOf: { ...repostOf, viewCount: 99 } })} comments={[]} />);
      expect(screen.getByText('99 views')).toBeInTheDocument();
    });

    it('simple repost without a repostOf count falls back to the outer prop', () => {
      render(
        <PostDetail
          post={makePost({ repostOf: { ...repostOf, likeCount: undefined as unknown as number } })}
          comments={[]}
        />,
      );
      expect(screen.getByText('3 likes')).toBeInTheDocument();
    });

    it("quote: outer stats bar keeps the quote's OWN counts, nested counter row shows the ORIGINAL's", () => {
      render(<PostDetail post={makePost({ repostOf, isQuote: true })} comments={[]} />);
      expect(screen.getByText('3 likes')).toBeInTheDocument();
      expect(screen.getByText('1 comments')).toBeInTheDocument();
      expect(screen.getByTestId('repost-like-count')).toHaveTextContent('42');
      expect(screen.getByTestId('repost-comment-count')).toHaveTextContent('7');
    });

    it('quote: nested view counter shows when present on repostOf', () => {
      render(<PostDetail post={makePost({ repostOf: { ...repostOf, viewCount: 99 }, isQuote: true })} comments={[]} />);
      expect(screen.getByTestId('repost-view-count')).toHaveTextContent('99');
    });

    it('quote: nested view counter hidden when absent on repostOf', () => {
      render(<PostDetail post={makePost({ repostOf, isQuote: true })} comments={[]} />);
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
        <PostDetail
          post={makePost({ repostOf: repostWithTranslations })}
          comments={[]}
          userLanguage="fr"
          onTapRepost={onTapRepost}
        />,
      );

      fireEvent.click(screen.getByText('FR'));

      expect(onTapRepost).not.toHaveBeenCalled();
      expect(screen.getByText(getLanguageName('en'))).toBeInTheDocument();
    });

    it('pressing a key on the language chip does not bubble into the repost navigation handler', () => {
      const onTapRepost = jest.fn();
      render(
        <PostDetail
          post={makePost({ repostOf: repostWithTranslations })}
          comments={[]}
          userLanguage="fr"
          onTapRepost={onTapRepost}
        />,
      );

      fireEvent.keyDown(screen.getByText('FR'), { key: 'Enter' });

      expect(onTapRepost).not.toHaveBeenCalled();
    });
  });

  // Majeur D — même chaîne que PostCard : `repostOf.mentions` était TOUJOURS
  // `undefined` tant que le gateway ne peuplait pas `postMentions` sur
  // `repostOf`. Maintenant qu'il le peuple (postIncludes.ts
  // `repostOfInclude.postMentions`), la citation doit surligner UNIQUEMENT ce
  // que le serveur a validé, et la rangée « Avec … » ne doit plus être
  // structurellement vide.
  describe("le contenu cité surligne selon les références de l'ORIGINAL", () => {
    const carol = {
      userId: 'u-carol', username: 'carol', displayName: 'Carol', avatar: null, display: 'NOTE' as const,
    };

    it('linkifie un pseudo présent dans repostOf.mentions', () => {
      render(
        <PostDetail
          post={makePost({ repostOf: { ...repostOf, content: 'Soirée avec @carol hier', mentions: [carol] } })}
          comments={[]}
        />,
      );

      expect(screen.getByRole('link', { name: '@carol' })).toHaveAttribute('href', '/u/carol');
    });

    it("NE linkifie PAS un pseudo absent de repostOf.mentions — le lien mort que la validation existe pour supprimer", () => {
      render(
        <PostDetail
          post={makePost({
            repostOf: { ...repostOf, content: 'Soirée avec @nimportequoi hier', mentions: [carol] },
          })}
          comments={[]}
        />,
      );

      expect(screen.queryByRole('link', { name: '@nimportequoi' })).toBeNull();
      expect(screen.getByText(/@nimportequoi/)).toBeInTheDocument();
    });

    it("la rangée « Avec … » n'est plus structurellement vide sur le repost", () => {
      render(
        <PostDetail
          post={makePost({ repostOf: { ...repostOf, content: 'Une soirée mémorable', mentions: [carol] } })}
          comments={[]}
        />,
      );

      expect(screen.getByText('Carol')).toBeInTheDocument();
    });
  });
});
