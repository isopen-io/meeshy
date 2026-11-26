import { describe, expect, test } from 'bun:test';

import { ADMIN_LANGUAGES } from '@/lib/i18n-admin-catalog';

import { gameStatsText, loadGameStatsTexts } from './game-texts';

/**
 * Les textes de l'onglet Jeu vivent HORS du catalogue d'administration
 * (`interface_catalogs_admin`, téléchargé par chaque écran de la console) et se
 * chargent à la demande, dans les quatre langues de l'administration (#20618).
 */
describe('les textes de l’onglet Jeu, à la demande', () => {
  test('les quatre langues portent les mêmes clés que le français, sans valeur vide', async () => {
    const source = Object.keys(await loadGameStatsTexts('fr')).sort();
    for (const language of ADMIN_LANGUAGES) {
      const texts = await loadGameStatsTexts(language);
      expect(Object.keys(texts).sort()).toEqual(source);
      expect(Object.values(texts).filter((value) => value.trim() === '')).toEqual([]);
    }
  });

  test('le catalogue d’administration ne les porte pas', async () => {
    for (const language of ADMIN_LANGUAGES) {
      const module: { readonly default: Readonly<Record<string, string>> } = await import(`@/lib/interface-catalogs/catalog-admin-${language}.ts`);
      expect(Object.keys(module.default).filter((key) => key.startsWith('admin.analytics.game.'))).toEqual([]);
    }
  });

  test('un paramètre se pose dans le texte', async () => {
    const texts = await loadGameStatsTexts('fr');
    expect(gameStatsText(texts, 'admin.analytics.game.longFlames.caption', { days: '7' })).toContain('7');
  });
});
