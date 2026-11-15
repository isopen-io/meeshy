import { describe, expect, test } from 'bun:test';

import { catalogPlaceholders } from './i18n-catalog';
import {
  isConversationStatsCatalogLoaded,
  loadConversationStatsCatalog,
  translateConversationStats,
  type ConversationStatsCatalog,
} from './i18n-conversation-stats-catalog';
import { SUPPORTED_INTERFACE_LANGUAGES } from './inline-interface-language-bootstrap.js';
import type { InterfaceLanguage } from './interface-language';

/**
 * LE CATALOGUE DES STATISTIQUES D'UNE CONVERSATION (#7835) — même discipline
 * que `i18n-sounds-mine-catalog.test.ts` : le français est la source des clés
 * `conversationStats.*`, chaque autre langue en porte EXACTEMENT les mêmes,
 * avec les mêmes paramètres, et aucune phrase n'est laissée en français. Les
 * mots viennent d'iOS (`dashboard.*` de `ConversationDashboardView.swift`).
 */

const loadAll = async (): Promise<ReadonlyArray<readonly [InterfaceLanguage, ConversationStatsCatalog]>> =>
  Promise.all(SUPPORTED_INTERFACE_LANGUAGES.map(async (language) => [language, await loadConversationStatsCatalog(language)] as const));

const sorted = (values: Iterable<string>): readonly string[] => [...values].sort();

describe('chaque langue porte toutes les clés conversationStats.* du français, et rien d’autre', () => {
  test('mêmes clés', async () => {
    const french = sorted(Object.keys(await loadConversationStatsCatalog('fr')));
    for (const [language, catalog] of await loadAll()) {
      const keys = sorted(Object.keys(catalog));
      expect({ language, missing: french.filter((key) => !keys.includes(key)) }).toEqual({ language, missing: [] });
      expect({ language, extra: keys.filter((key) => !french.includes(key)) }).toEqual({ language, extra: [] });
    }
  });

  test('chaque valeur est un texte, jamais vide, jamais sa propre clé, avec les paramètres du français', async () => {
    const french = await loadConversationStatsCatalog('fr');
    for (const [language, catalog] of await loadAll()) {
      for (const [key, value] of Object.entries(catalog)) {
        expect({ language, key, empty: value.trim().length === 0 || value === key }).toEqual({ language, key, empty: false });
        const expected = sorted(catalogPlaceholders(french[key as keyof ConversationStatsCatalog]));
        expect({ language, key, params: sorted(catalogPlaceholders(value)) }).toEqual({ language, key, params: expected });
      }
    }
  });

  test('les phrases sont traduites, pas recopiées du français', async () => {
    const french = await loadConversationStatsCatalog('fr');
    const phrases = [
      'conversationStats.section',
      'conversationStats.activity',
      'conversationStats.participants',
      'conversationStats.error',
      'conversationStats.empty',
      'conversationStats.offline',
      'conversationStats.period.all',
    ] as const;
    for (const [language, catalog] of await loadAll()) {
      if (language === 'fr') continue;
      for (const key of phrases) {
        expect({ language, key, copied: catalog[key] === french[key] }).toEqual({ language, key, copied: false });
      }
    }
  });
});

describe('translateConversationStats', () => {
  test('les mots d’iOS, à leur place dans chaque langue', async () => {
    await Promise.all([loadConversationStatsCatalog('de'), loadConversationStatsCatalog('fr')]);
    expect(isConversationStatsCatalogLoaded('de')).toBe(true);
    expect(translateConversationStats('de', 'conversationStats.participants')).toBe('Aktivität pro Teilnehmer');
    expect(translateConversationStats('fr', 'conversationStats.words_count', { count: '12' })).toBe('12 mots');
  });
});
