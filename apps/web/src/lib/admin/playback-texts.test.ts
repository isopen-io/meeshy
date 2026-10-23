import { describe, expect, test } from 'bun:test';

import { ADMIN_LANGUAGES } from '@/lib/i18n-admin-catalog';

import { loadPlaybackTexts, playbackText } from './playback-texts';

/**
 * Les textes de l'onglet Lecture vivent HORS du catalogue d'administration
 * (`interface_catalogs_admin`, téléchargé par chaque écran de la console) et se
 * chargent à la demande, dans les quatre langues de l'administration.
 */
describe('les textes de l’onglet Lecture, à la demande', () => {
  test('les quatre langues portent les mêmes clés que le français', async () => {
    const source = Object.keys(await loadPlaybackTexts('fr')).sort();
    for (const language of ADMIN_LANGUAGES) expect(Object.keys(await loadPlaybackTexts(language)).sort()).toEqual(source);
  });

  test('le catalogue d’administration ne les porte plus', async () => {
    for (const language of ADMIN_LANGUAGES) {
      const module: { readonly default: Readonly<Record<string, string>> } = await import(`@/lib/interface-catalogs/catalog-admin-${language}.ts`);
      expect(Object.keys(module.default).filter((key) => key.startsWith('admin.analytics.playback.'))).toEqual([]);
    }
  });

  test('un paramètre se pose dans le texte', async () => {
    const texts = await loadPlaybackTexts('fr');
    expect(playbackText(texts, 'admin.analytics.playback.suppressed.caption', { count: '5' })).toContain('5');
  });
});
