import { describe, it, expect } from '@jest/globals';
import { PostVisibility } from '@meeshy/shared/prisma/client';
import { feedsSoundLibrary } from '../soundEligibility';

/**
 * La règle qui décide ce qui entre dans la bibliothèque. Elle vivait dupliquée
 * sur deux sites de `PostService`, où l'une des deux copies avait déjà été
 * oubliée une fois — c'était la troisième porte du piège d'attribution.
 *
 * Couverture EXHAUSTIVE de l'énumération : ajouter une visibilité au schéma sans
 * décider de son sort fera rougir ce fichier au lieu de la laisser hériter d'un
 * comportement par défaut.
 */
describe('feedsSoundLibrary', () => {
  const ELIGIBLE = [PostVisibility.PUBLIC, PostVisibility.COMMUNITY];
  const EXCLUDED = [
    PostVisibility.FRIENDS, PostVisibility.PRIVATE,
    PostVisibility.EXCEPT, PostVisibility.ONLY,
  ];

  it('test_everyVisibilityOfTheEnumIsDecided', () => {
    const decided = new Set([...ELIGIBLE, ...EXCLUDED]);
    expect(decided.size).toBe(Object.keys(PostVisibility).length);
  });

  it.each(ELIGIBLE)('test_%s_feedsTheLibrary', (visibility) => {
    expect(feedsSoundLibrary({ visibility })).toBe(true);
  });

  it.each(EXCLUDED)('test_%s_doesNotFeedTheLibrary', (visibility) => {
    expect(feedsSoundLibrary({ visibility })).toBe(false);
  });

  it.each([...ELIGIBLE, ...EXCLUDED])('test_%s_repost_neverFeedsTheLibrary', (visibility) => {
    // `repostPost` duplique les médias de la source SOUS le reposteur : sans
    // cette exclusion, republier crée un `Sound` crédité au reposteur avec
    // l'audio d'autrui.
    expect(feedsSoundLibrary({ visibility, repostOfId: 'source-1' })).toBe(false);
  });

  it('test_unknownOrMissingVisibility_isRefused', () => {
    // Fail-closed : une valeur inattendue ne doit pas alimenter la bibliothèque.
    expect(feedsSoundLibrary({ visibility: undefined })).toBe(false);
    expect(feedsSoundLibrary({ visibility: null })).toBe(false);
    expect(feedsSoundLibrary({ visibility: 'PUBLIQUE' })).toBe(false);
  });
});
