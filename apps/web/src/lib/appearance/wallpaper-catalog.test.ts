import { describe, expect, test } from 'bun:test';

import { findWallpaperDesign, loadWallpaperNames, visibleWallpaperPacks, WALLPAPER_PACKS } from './wallpaper-catalog';

describe('les 15 modèles embarqués', () => {
  test('cinq packs et quinze modèles que le contrat lit tous', () => {
    expect(WALLPAPER_PACKS.map((pack) => pack.slug)).toEqual(['essentiels', 'heritages', 'nature-et-ciel', 'illustrations', 'animes']);
    expect(WALLPAPER_PACKS.flatMap((pack) => pack.designs)).toHaveLength(15);
  });

  test('trouve un modèle par son pack et sa clé, pas par la clé seule', () => {
    expect(findWallpaperDesign('heritages', 'zellige')?.style).toBe('pattern');
    expect(findWallpaperDesign('essentiels', 'zellige')).toBeUndefined();
  });

  test('sans réponse de la passerelle, seuls les packs installés d’office se montrent', () => {
    expect(visibleWallpaperPacks(new Set()).map((pack) => pack.slug)).toEqual(['essentiels', 'animes']);
    expect(visibleWallpaperPacks(new Set(['illustrations'])).map((pack) => pack.slug)).toEqual(['essentiels', 'illustrations', 'animes']);
  });

  test('chaque langue nomme chaque modèle', async () => {
    for (const language of ['fr', 'en', 'es', 'pt', 'de', 'it', 'ar'] as const) {
      const names = await loadWallpaperNames(language);
      for (const design of WALLPAPER_PACKS.flatMap((pack) => pack.designs)) expect(names.designs[design.key]).toBeTruthy();
    }
  });
});
