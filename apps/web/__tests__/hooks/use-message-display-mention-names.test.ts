/**
 * Une mention doit se LIRE avec le nom de la personne, pas avec son handle — la
 * même chose que rend iOS (`MessageTextRenderer.render(…, mentionDisplayNames:)`,
 * câblé jusqu'à la bulle par `BubbleStyle` / `BubbleExpandableText`). Le module
 * `apps/web/utils/mention-display.ts` portait déjà la carte et ses règles, mais
 * aucun composant ne le montait : `dev` affichait « @jdupont42 » là où iOS
 * affiche « @Jean Dupont » pour le MÊME message (#7458).
 *
 * Le libellé change ; l'URL ne change JAMAIS. Un nom affiché porte des espaces et
 * des accents — s'il entrait dans le lien, la cible n'existerait plus. C'est aussi
 * pourquoi la résolution vit DANS `mentionsToLinks` et non dans une passe qui
 * l'encadre : substituer avant, c'est casser la reconnaissance du handle ;
 * substituer après, c'est casser le markdown déjà produit.
 */
import { renderHook } from '@testing-library/react';
import { useMessageDisplay } from '@/hooks/use-message-display';

const mentioned = (username: string, displayName: string | null) => ({
  userId: `u-${username}`,
  username,
  displayName,
  avatar: null,
});

describe('useMessageDisplay — le nom affiché d’une mention', () => {
  it('rend le nom de la personne dans le libellé, et garde le handle dans le lien', () => {
    const { result } = renderHook(() =>
      useMessageDisplay({
        message: {
          id: 'm1',
          content: 'salut @jdupont42',
          originalLanguage: 'fr',
          validatedMentions: ['jdupont42'],
          mentionedUsers: [mentioned('jdupont42', 'Jean Dupont')],
        },
        currentDisplayLanguage: 'fr',
      }),
    );
    expect(result.current.displayContentWithMentions).toBe('salut [@Jean Dupont](/u/jdupont42)');
  });

  it('garde le handle en libellé quand la personne n’a pas de nom distinct', () => {
    const { result } = renderHook(() =>
      useMessageDisplay({
        message: {
          id: 'm2',
          content: 'salut @bob',
          originalLanguage: 'fr',
          validatedMentions: ['bob'],
          mentionedUsers: [mentioned('bob', 'bob')],
        },
        currentDisplayLanguage: 'fr',
      }),
    );
    expect(result.current.displayContentWithMentions).toBe('salut [@bob](/u/bob)');
  });

  it('garde le handle en libellé quand aucune résolution n’accompagne le message', () => {
    const { result } = renderHook(() =>
      useMessageDisplay({
        message: {
          id: 'm3',
          content: 'salut @jdupont42',
          originalLanguage: 'fr',
          validatedMentions: ['jdupont42'],
        },
        currentDisplayLanguage: 'fr',
      }),
    );
    expect(result.current.displayContentWithMentions).toBe('salut [@jdupont42](/u/jdupont42)');
  });

  it('résout le nom quel que soit la casse tapée dans le message', () => {
    const { result } = renderHook(() =>
      useMessageDisplay({
        message: {
          id: 'm4',
          content: 'salut @JDupont42',
          originalLanguage: 'fr',
          validatedMentions: ['jdupont42'],
          mentionedUsers: [mentioned('jdupont42', 'Jean Dupont')],
        },
        currentDisplayLanguage: 'fr',
      }),
    );
    expect(result.current.displayContentWithMentions).toBe('salut [@Jean Dupont](/u/jdupont42)');
  });

  it('ne réécrit pas une mention non validée, même si un nom est connu', () => {
    const { result } = renderHook(() =>
      useMessageDisplay({
        message: {
          id: 'm5',
          content: 'salut @jdupont42',
          originalLanguage: 'fr',
          validatedMentions: [],
          mentionedUsers: [mentioned('jdupont42', 'Jean Dupont')],
        },
        currentDisplayLanguage: 'fr',
      }),
    );
    expect(result.current.displayContentWithMentions).toBe('salut @jdupont42');
  });

  it('ne touche pas à une adresse e-mail dont la partie droite est un pseudo connu', () => {
    const { result } = renderHook(() =>
      useMessageDisplay({
        message: {
          id: 'm6',
          content: 'écris à bob@jdupont42.com',
          originalLanguage: 'fr',
          validatedMentions: ['jdupont42'],
          mentionedUsers: [mentioned('jdupont42', 'Jean Dupont')],
        },
        currentDisplayLanguage: 'fr',
      }),
    );
    expect(result.current.displayContentWithMentions).toBe('écris à bob@jdupont42.com');
  });

  it('résout le nom sur le contenu TRADUIT, pas seulement sur l’original', () => {
    const { result } = renderHook(() =>
      useMessageDisplay({
        message: {
          id: 'm7',
          content: 'hi @jdupont42',
          originalLanguage: 'en',
          translations: [{ language: 'fr', content: 'salut @jdupont42' } as never],
          validatedMentions: ['jdupont42'],
          mentionedUsers: [mentioned('jdupont42', 'Jean Dupont')],
        },
        currentDisplayLanguage: 'fr',
      }),
    );
    expect(result.current.displayContentWithMentions).toBe('salut [@Jean Dupont](/u/jdupont42)');
  });
});
