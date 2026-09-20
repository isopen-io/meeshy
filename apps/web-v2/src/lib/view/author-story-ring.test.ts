import { describe, expect, test } from 'bun:test';

import { authorStoryRing } from './author-story-ring';
import type { StoryTrayGroup } from './story-tray';

/**
 * **CE QU'UN AVATAR SAIT DES STORIES DE SON AUTEUR** (#7185).
 *
 * La règle se mesure ICI, sans React : quel auteur, quelle story d'entrée, quel
 * état. Le hook qui lit le cache n'est qu'une enveloppe.
 *
 * ## `null` EST LE CAS NOMINAL, et c'est ce que ces témoins gardent
 *
 * La plupart des auteurs n'ont pas de story. Un anneau qui s'afficherait sans
 * destination serait un contrôle qui ment (loi 4) — d'où quatre cas sur six
 * consacrés à l'ABSENCE : pas de corpus, pas d'auteur, auteur inconnu du
 * corpus, entrée vide.
 *
 * Le dernier n'est pas théorique : `entryStoryId` est garanti par
 * `groupStoriesByAuthor`, mais un cache PERSISTÉ d'une version antérieure peut
 * porter une forme que le code d'aujourd'hui ne produit plus. Le dépôt a déjà
 * payé exactement ça sur le fil (#6893 — un document v3 relu par le runtime
 * v1). Une entrée absente se traite comme une absence, jamais comme une story
 * ouvrable vers nulle part.
 */

const groupe = (patch: Partial<StoryTrayGroup> = {}): StoryTrayGroup =>
  ({
    authorId: 'u-nour',
    author: { id: 'u-nour', displayName: 'Nour' },
    stories: [{ id: 'st-1', isViewedByMe: false }],
    latestAt: 1,
    hasUnseen: true,
    isMine: false,
    entryStoryId: 'st-1',
    ...patch,
  }) as StoryTrayGroup;

describe('l’auteur a une story — l’anneau a une destination', () => {
  test('il rend l’entrée et l’état non vu', () => {
    expect(authorStoryRing([groupe()], 'u-nour')).toEqual({ entryStoryId: 'st-1', unseen: true });
  });

  /**
   * L'ÉTAT VU EST UNE AUTRE COULEUR, PAS UNE ABSENCE : une story déjà vue
   * s'ouvre toujours. Confondre les deux retirerait l'accès à ce qu'on vient
   * de regarder.
   */
  test('une story déjà vue garde sa destination, et le dit', () => {
    expect(authorStoryRing([groupe({ hasUnseen: false })], 'u-nour')).toEqual({
      entryStoryId: 'st-1',
      unseen: false,
    });
  });

  test('il désigne le BON auteur parmi plusieurs', () => {
    const corpus = [groupe(), groupe({ authorId: 'u-kwame', entryStoryId: 'st-9', hasUnseen: false })];

    expect(authorStoryRing(corpus, 'u-kwame')).toEqual({ entryStoryId: 'st-9', unseen: false });
  });
});

describe('et sans story, rien — le cas nominal', () => {
  test('aucun corpus en cache : l’écran ne monte pas le rail', () => {
    expect(authorStoryRing(undefined, 'u-nour')).toBe(null);
  });

  test('un auteur absent du corpus', () => {
    expect(authorStoryRing([groupe()], 'u-personne')).toBe(null);
  });

  test('un auteur sans identifiant — un compte anonyme', () => {
    expect(authorStoryRing([groupe()], undefined)).toBe(null);
    expect(authorStoryRing([groupe()], '')).toBe(null);
  });

  /** LE CACHE PÉRIMÉ — voir le doc-comment : une forme d'hier, relue
      aujourd'hui, ne doit pas produire un anneau vers nulle part. */
  test('un groupe sans entrée exploitable', () => {
    expect(authorStoryRing([groupe({ entryStoryId: '' })], 'u-nour')).toBe(null);
    expect(authorStoryRing([groupe({ entryStoryId: undefined as unknown as string })], 'u-nour')).toBe(null);
  });
});
