import { describe, expect, test } from 'bun:test';

import { loadGameCatalogParts } from '@/lib/i18n-game-catalog';
import { SUPPORTED_INTERFACE_LANGUAGES } from '@/lib/inline-interface-language-bootstrap.js';
import type { InterfaceLanguage } from '@/lib/interface-language';

import { GAME_DETAIL_FACTS, GAME_DETAIL_FAMILIES, GAME_DETAIL_HOW } from './detail-families';

/**
 * LES PRÉCISIONS D'UN ÉLÉMENT, AU CATALOGUE (#9563, amendement n° 2) — chaque
 * famille d'élément a ses deux phrases et chaque donnée la sienne, dans les sept
 * langues, sous des clés que l'app iOS porte à l'identique
 * (`game.detail.<élément>.*`). Elles vivent dans la partie « concept » du
 * catalogue : celle que les routes de Progression chargent, et elles seules.
 */
const LANGUAGES = SUPPORTED_INTERFACE_LANGUAGES as readonly InterfaceLanguage[];

/** Une phrase de modale se lit d'un trait : 110 caractères au plus, comme une phrase de carte reste sous 72. */
const SENTENCE_MAX = 110;

const conceptPart = async (language: InterfaceLanguage): Promise<Readonly<Record<string, string>>> =>
  (await import(`../interface-catalogs/catalog-game-concept-${language}.ts`)).default as Readonly<Record<string, string>>;

const LABELS = [
  'game.detail.obtain_label',
  'game.detail.gives_label',
  'game.detail.earned',
  'game.detail.earned_on',
  'game.detail.locked',
  'game.detail.missing',
  'game.detail.see_fiche',
  'game.detail.open',
  'game.detail.rarity',
  'game.detail.header_group',
  'game.detail.elan.active',
  'game.detail.elan.idle',
  'game.detail.elan.points',
  'game.detail.player.what',
] as const;

const sentenceKeys = (): readonly string[] => [
  ...GAME_DETAIL_FAMILIES.flatMap((family) => [`game.detail.${family}.what`, `game.detail.${family}.how`]),
  ...GAME_DETAIL_FACTS.map((fact) => `game.detail.fact.${fact}`),
  'game.detail.player.what',
];

describe('les familles et les données', () => {
  test('dix-neuf familles, chacune dit si sa seconde phrase est « comment l’obtenir » ou « ce que ça donne »', () => {
    expect(GAME_DETAIL_FAMILIES).toHaveLength(19);
    expect(Object.keys(GAME_DETAIL_HOW).sort()).toEqual([...GAME_DETAIL_FAMILIES].sort());
    expect(new Set(GAME_DETAIL_FACTS).size).toBe(GAME_DETAIL_FACTS.length);
  });
});

describe('le catalogue porte les précisions, dans les sept langues', () => {
  for (const language of LANGUAGES) {
    test(`${language} : chaque famille a ses deux phrases, chaque donnée la sienne, chaque libellé existe`, async () => {
      const catalog = await conceptPart(language);
      for (const key of [...sentenceKeys(), ...LABELS]) {
        const text = catalog[key];
        expect({ language, key, present: typeof text === 'string' && text.trim() !== '' && text !== key }).toEqual({ language, key, present: true });
      }
    });

    test(`${language} : aucune phrase ne dépasse ${SENTENCE_MAX} caractères`, async () => {
      const catalog = await conceptPart(language);
      for (const key of sentenceKeys()) {
        const text = catalog[key] ?? '';
        expect({ language, key, length: [...text].length <= SENTENCE_MAX }).toEqual({ language, key, length: true });
      }
    });
  }

  test('les phrases sont traduites, pas recopiées du français', async () => {
    const french = await conceptPart('fr');
    for (const language of LANGUAGES.filter((l) => l !== 'fr')) {
      const catalog = await conceptPart(language);
      const copied = sentenceKeys().filter((key) => catalog[key] === french[key]);
      expect({ language, copied }).toEqual({ language, copied: [] });
    }
  });

  test('ces clés se chargent avec les routes de Progression (partie « concept »)', async () => {
    await loadGameCatalogParts('fr', ['banner', 'core', 'concept']);
    const { translateGame } = await import('@/lib/i18n-game-catalog');
    expect((translateGame as (language: InterfaceLanguage, key: string) => string)('fr', 'game.detail.see_fiche')).toBe('Voir la fiche');
  });
});
