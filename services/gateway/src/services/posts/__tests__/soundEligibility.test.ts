import { describe, it, expect } from '@jest/globals';
import { PostVisibility } from '@meeshy/shared/prisma/client';
import { feedsSoundLibrary, videoSoundExtractionAllowed } from '../soundEligibility';

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

/**
 * #8012 (directive porteur 2026-09-26) — un contenu PUBLIC verse la bande-son
 * de ses vidéos (fond ET scène) à la bibliothèque. Les clients n'envoient
 * `allowSoundExtraction` que si l'auteur a touché l'interrupteur : l'absence
 * vaut donc accord, seul un refus EXPLICITE retient la bande-son.
 */
describe('videoSoundExtractionAllowed', () => {
  it('test_absentChoice_allowsExtraction', () => {
    expect(videoSoundExtractionAllowed(undefined)).toBe(true);
    expect(videoSoundExtractionAllowed(null)).toBe(true);
  });

  it('test_explicitRefusal_isHonoured', () => {
    expect(videoSoundExtractionAllowed(false)).toBe(false);
  });

  it('test_explicitConsent_allowsExtraction', () => {
    expect(videoSoundExtractionAllowed(true)).toBe(true);
  });
});
