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

  it('replyToContent descend le prisme ordonné : une traduction rang-2 gagne sur l\'original quand le rang-1 manque', () => {
    // Prisme lecteur ['fr','en'] (rang 1 fr, rang 2 en). Principal résolu en fr.
    // La réponse citée est allemande et n'a QU'UNE traduction anglaise (rang 2).
    // Ancien code : cherche 'fr', n'en trouve pas, repli sur l'ORIGINAL allemand.
    // Correct : descendre le prisme ⇒ servir la traduction anglaise (rang 2).
    const { result } = renderHook(() =>
      useMessageDisplay({
        message: {
          id: 'm-reply-rank2',
          content: 'Guten Tag',
          originalContent: 'Guten Tag',
          originalLanguage: 'de',
          translations: [{ language: 'fr', content: 'Bonjour' } as any],
          replyTo: {
            id: 'r-rank2',
            content: 'Danke',
            originalContent: 'Danke',
            originalLanguage: 'de',
            translations: [{ language: 'en', content: 'Thanks' } as any],
          },
        },
        currentDisplayLanguage: 'fr',
        usedLanguages: ['fr', 'en'],
      }),
    );
    expect(result.current.replyToContent).toBe('Thanks');
  });

  it('replyToContent : la langue affichée du parent (toggle) reste prioritaire sur le reste du prisme', () => {
    // currentDisplayLanguage 'de' (toggle manuel du parent). La réponse a 'de' ET
    // 'fr' : le choix courant gagne, on ne rétrograde jamais vers un rang du prisme.
    const { result } = renderHook(() =>
      useMessageDisplay({
        message: {
          id: 'm-reply-toggle',
          content: 'X',
          originalContent: 'X',
          originalLanguage: 'es',
          translations: [],
          replyTo: {
            id: 'r-toggle',
            content: 'Hola',
            originalContent: 'Hola',
            originalLanguage: 'es',
            translations: [
              { language: 'de', content: 'Hallo' } as any,
              { language: 'fr', content: 'Salut' } as any,
            ],
          },
        },
        currentDisplayLanguage: 'de',
        usedLanguages: ['fr', 'en'],
      }),
    );
    expect(result.current.replyToContent).toBe('Hallo');
  });

  it('replyToContent : descente rang-2 avec code région-tagué (préférence en-US ↔ traduction en)', () => {
    const { result } = renderHook(() =>
      useMessageDisplay({
        message: {
          id: 'm-reply-region',
          content: 'Guten Tag',
          originalContent: 'Guten Tag',
          originalLanguage: 'de',
          translations: [],
          replyTo: {
            id: 'r-region',
            content: 'Danke',
            originalContent: 'Danke',
            originalLanguage: 'de',
            translations: [{ language: 'en', translatedContent: 'Thanks' } as any],
          },
        },
        currentDisplayLanguage: 'fr',
        usedLanguages: ['fr', 'en-US'],
      }),
    );
    expect(result.current.replyToContent).toBe('Thanks');
  });

  it('replyToContent : sans traduction dans aucun rang du prisme, sert l\'original', () => {
    const { result } = renderHook(() =>
      useMessageDisplay({
        message: {
          id: 'm-reply-none',
          content: 'X',
          originalContent: 'X',
          originalLanguage: 'fr',
          translations: [],
          replyTo: {
            id: 'r-none',
            content: 'Ciao',
            originalContent: 'Ciao',
            originalLanguage: 'it',
            translations: [{ language: 'de', content: 'Hallo' } as any],
          },
        },
        currentDisplayLanguage: 'fr',
        usedLanguages: ['fr', 'en'],
      }),
    );
    expect(result.current.replyToContent).toBe('Ciao');
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
