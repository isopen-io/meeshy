/**
 * `useMessageDisplay` est le chemin VIVANT de résolution du contenu affiché d'une
 * bulle (consommé par BubbleMessageNormalView via `displayContent`/`replyToContent`).
 * Les codes de langue comparés — `currentDisplayLanguage`, `originalLanguage`, clés
 * de traduction — sont verbatim et peuvent être région-tagués, 3-lettres ou legacy.
 * Une comparaison brute `===` traitait `fr-FR` et `fr` comme deux langues, violant
 * le Prisme. SSOT : normalizeLanguageForDedup (language-normalize.ts).
 */
import { renderHook } from '@testing-library/react';
import { useMessageDisplay } from '@/hooks/use-message-display';

describe('useMessageDisplay — canonicalisation des codes de langue', () => {
  it("displayContent sert l'original quand la langue affichée EST celle du message sous forme taguée", () => {
    const { result } = renderHook(() =>
      useMessageDisplay({
        message: {
          id: 'm1',
          content: 'FALLBACK',
          originalContent: 'Bonjour',
          originalLanguage: 'fr-FR',
          translations: [],
        },
        currentDisplayLanguage: 'fr',
      }),
    );
    expect(result.current.displayContent).toBe('Bonjour');
  });

  it('displayContent matche une traduction keyée sous forme taguée (fr-FR) pour un affichage fr', () => {
    const { result } = renderHook(() =>
      useMessageDisplay({
        message: {
          id: 'm2',
          content: 'Hello',
          originalContent: 'Hello',
          originalLanguage: 'en',
          translations: [
            { language: 'fr-FR', content: 'Bonjour' } as any,
          ],
        },
        currentDisplayLanguage: 'fr',
      }),
    );
    expect(result.current.displayContent).toBe('Bonjour');
  });

  it('replyToContent matche une traduction keyée 3-lettres (fra) pour un affichage fr', () => {
    const { result } = renderHook(() =>
      useMessageDisplay({
        message: {
          id: 'm3',
          content: 'Hi',
          originalContent: 'Hi',
          originalLanguage: 'en',
          translations: [],
          replyTo: {
            id: 'r1',
            content: 'Hello',
            originalContent: 'Hello',
            originalLanguage: 'en',
            translations: [
              { language: 'fra', translatedContent: 'Bonjour' } as any,
            ],
          },
        },
        currentDisplayLanguage: 'fr',
      }),
    );
    expect(result.current.replyToContent).toBe('Bonjour');
  });

  it('ne matche jamais deux langues distinctes : fil affiché ne sert pas une traduction fi', () => {
    const { result } = renderHook(() =>
      useMessageDisplay({
        message: {
          id: 'm5',
          content: 'Hello',
          originalContent: 'Hello',
          originalLanguage: 'en',
          translations: [{ language: 'fi', content: 'Hei' } as any],
        },
        currentDisplayLanguage: 'fil',
      }),
    );
    // Aucun match fil↔fi ⇒ repli sur le contenu du message, jamais la trad finnoise.
    expect(result.current.displayContent).toBe('Hello');
  });
});
