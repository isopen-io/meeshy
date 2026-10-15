import { describe, expect, test } from 'bun:test';

import { findWallpaperDesign, loadWallpaperNames, visibleWallpaperPacks, WALLPAPER_PACKS } from './wallpaper-catalog';

describe('les 14 modèles embarqués', () => {
  test('quatre packs et quatorze modèles que le contrat lit tous', () => {
    expect(WALLPAPER_PACKS.map((pack) => pack.slug)).toEqual(['essentiels', 'heritages', 'nature-et-ciel', 'illustrations']);
    expect(WALLPAPER_PACKS.flatMap((pack) => pack.designs)).toHaveLength(14);
  });

  test('trouve un modèle par son pack et sa clé, pas par la clé seule', () => {
    expect(findWallpaperDesign('heritages', 'zellige')?.style).toBe('pattern');
    expect(findWallpaperDesign('essentiels', 'zellige')).toBeUndefined();
  });

  test('sans réponse de la passerelle, seuls les Essentiels se montrent', () => {
    expect(visibleWallpaperPacks(new Set()).map((pack) => pack.slug)).toEqual(['essentiels']);
    expect(visibleWallpaperPacks(new Set(['illustrations'])).map((pack) => pack.slug)).toEqual(['essentiels', 'illustrations']);
  });

  test('chaque langue nomme chaque modèle', async () => {
    for (const language of ['fr', 'en', 'es', 'pt', 'de', 'it', 'ar'] as const) {
      const names = await loadWallpaperNames(language);
      for (const design of WALLPAPER_PACKS.flatMap((pack) => pack.designs)) expect(names.designs[design.key]).toBeTruthy();
    }
  });
});
