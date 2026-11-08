import { describe, expect, test } from 'bun:test';

import { findWallpaperDesign, loadWallpaperNames, visibleWallpaperPacks, WALLPAPER_PACKS } from './wallpaper-catalog';

describe('les 17 modèles embarqués', () => {
  test('onze packs et quarante et un modèles que le contrat lit tous — les fonds de Noël (#15553), les deux collections Meeshy (#15158), puis les fonds du Nouvel An (#16271)', () => {
    expect(WALLPAPER_PACKS.map((pack) => pack.slug)).toEqual(['essentiels', 'heritages', 'nature-et-ciel', 'illustrations', 'animes', 'fonds-noel', 'fonds-noel-vivants', 'meeshy-fonds', 'meeshy-fonds-vivants', 'nouvel-an-fonds', 'nouvel-an-fonds-vifs']);
    expect(WALLPAPER_PACKS.flatMap((pack) => pack.designs)).toHaveLength(41);
  });

  test('les fonds de Noël, un par thème, se trouvent par leur pack ; les animés portent leur film (#15553)', () => {
    expect(['flocons-cristal', 'guirlande-etoilee', 'sucre-d-orge-raye'].map((key) => findWallpaperDesign('fonds-noel', key)?.style)).toEqual(['pattern', 'pattern', 'pattern']);
    expect(['neige-de-noel', 'ampoules-de-noel', 'etincelles-atelier'].map((key) => findWallpaperDesign('fonds-noel-vivants', key)?.lottie !== undefined)).toEqual([true, true, true]);
    expect(visibleWallpaperPacks(new Set()).map((pack) => pack.slug)).not.toContain('fonds-noel');
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
