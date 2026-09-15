import { beforeEach, describe, expect, test } from 'bun:test';

import { storyViewedStore, viewedStoryIds } from './story-viewed-store';

describe('storyViewedStore — l\'avance optimiste sur « vu par moi » (#5817)', () => {
  beforeEach(() => {
    storyViewedStore.setState({ ids: new Set<string>() });
  });

  test('vide au départ — jamais deviné depuis un compte de vues', () => {
    expect(viewedStoryIds().size).toBe(0);
  });

  test('marquer une story la rend vue immédiatement, sans réseau', () => {
    storyViewedStore.getState().markViewed('st-1');
    expect(viewedStoryIds().has('st-1')).toBe(true);
  });

  test('l\'ensemble est REMPLACÉ, jamais muté — un abonné voit une nouvelle identité', () => {
    const avant = viewedStoryIds();
    storyViewedStore.getState().markViewed('st-1');
    expect(viewedStoryIds()).not.toBe(avant);
    expect(avant.has('st-1')).toBe(false);
  });

  test('remarquer la MÊME story ne produit aucun nouvel état — pas de re-rendu pour rien', () => {
    storyViewedStore.getState().markViewed('st-1');
    const apres = viewedStoryIds();
    storyViewedStore.getState().markViewed('st-1');
    expect(viewedStoryIds()).toBe(apres);
  });
});
