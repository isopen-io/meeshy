/**
 * Le corps d'un post se lit UNE fois, dans la langue du lecteur, et la rangée de
 * drapeaux dit laquelle — sous le contenu, jamais devant.
 *
 * `PostDetail` montait `TranslationToggle` en variante `block` avec
 * `showContent={false}`, un drapeau que cette variante IGNORAIT : elle rendait
 * son propre paragraphe, puis `PostContentText` rendait le contenu ORIGINAL
 * juste dessous. Un post traduit s'affichait donc en double — « Bonjour » suivi
 * de « Hello » — et la zone « parchemin » recopiait par-dessus un extrait de
 * chaque traduction, plafonnée à trois.
 */
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { PostDetail } from '@/components/v2/PostDetail';
import type { Post } from '@meeshy/shared/types/post';

// Convention du dépôt (cf. `__tests__/app/hashtag/page.test.tsx`) : `LanguageOrb`
// porte un `<style jsx>` DYNAMIQUE que le mock styled-jsx de Jest ne sait pas
// servir. Il est hors sujet ici — ce qui est mesuré, c'est le corps servi et la
// rangée qui le nomme.
jest.mock('@/components/v2/LanguageOrb', () => ({
  LanguageOrb: () => <span data-testid="language-orb" />,
}));

function makePost(overrides: Partial<Post> = {}): Post {
  return {
    id: 'post-1',
    authorId: 'author-1',
    type: 'POST',
    visibility: 'PUBLIC',
    content: 'Hello everyone',
    originalLanguage: 'en',
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

const TRANSLATED = makePost({
  translations: { fr: { text: 'Bonjour tout le monde' }, es: { text: 'Hola a todos' } },
} as Partial<Post>);

describe('PostDetail — le corps se lit une fois, et la rangée dit la langue', () => {
  it("sert le corps dans la langue du lecteur, et l'original ne l'accompagne PAS", () => {
    render(<PostDetail post={TRANSLATED} comments={[]} userLanguage="fr" />);

    expect(screen.getByText('Bonjour tout le monde')).toBeInTheDocument();
    expect(screen.queryByText('Hello everyone')).not.toBeInTheDocument();
  });

  it('rend le corps exactement une fois', () => {
    render(<PostDetail post={TRANSLATED} comments={[]} userLanguage="fr" />);

    expect(screen.getAllByText('Bonjour tout le monde')).toHaveLength(1);
  });

  it('offre un drapeau par langue servie, original compris', () => {
    render(<PostDetail post={TRANSLATED} comments={[]} userLanguage="fr" />);

    expect(screen.getByTestId('translation-flag-fr')).toBeInTheDocument();
    expect(screen.getByTestId('translation-flag-es')).toBeInTheDocument();
    expect(screen.getByTestId('translation-flag-en')).toBeInTheDocument();
  });

  it('change le corps affiché au clic sur un drapeau', () => {
    render(<PostDetail post={TRANSLATED} comments={[]} userLanguage="fr" />);

    fireEvent.click(screen.getByTestId('translation-flag-es'));

    expect(screen.getByText('Hola a todos')).toBeInTheDocument();
    expect(screen.queryByText('Bonjour tout le monde')).not.toBeInTheDocument();
  });

  it("ne montre aucune rangée quand le post n'existe que dans une langue", () => {
    render(<PostDetail post={makePost()} comments={[]} userLanguage="en" />);

    expect(screen.getByText('Hello everyone')).toBeInTheDocument();
    expect(screen.queryByTestId('translation-flag-en')).not.toBeInTheDocument();
  });
});
