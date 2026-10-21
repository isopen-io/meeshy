import { describe, expect, test } from 'bun:test';

import { catalogPlaceholders } from './i18n-catalog';
import {
  isConversationManageCatalogLoaded,
  loadConversationManageCatalog,
  translateConversationManage,
  type ConversationManageCatalog,
} from './i18n-conversation-manage-catalog';
import { SUPPORTED_INTERFACE_LANGUAGES } from './inline-interface-language-bootstrap.js';
import type { InterfaceLanguage } from './interface-language';

/**
 * LE CATALOGUE DE LA GESTION D'UNE CONVERSATION (#10613, #7836) — même discipline
 * que `i18n-sounds-mine-catalog.test.ts` : le français est la source des clés
 * `conversationManage.*`, chaque autre langue en porte EXACTEMENT les mêmes,
 * avec les mêmes paramètres, et aucune phrase n'est laissée en français. Les
 * mots viennent d'iOS (`dashboard.*` de `ConversationDashboardView.swift`).
 */

const loadAll = async (): Promise<ReadonlyArray<readonly [InterfaceLanguage, ConversationManageCatalog]>> =>
  Promise.all(SUPPORTED_INTERFACE_LANGUAGES.map(async (language) => [language, await loadConversationManageCatalog(language)] as const));

const sorted = (values: Iterable<string>): readonly string[] => [...values].sort();

describe('chaque langue porte toutes les clés conversationManage.* du français, et rien d’autre', () => {
  test('mêmes clés', async () => {
    const french = sorted(Object.keys(await loadConversationManageCatalog('fr')));
    for (const [language, catalog] of await loadAll()) {
      const keys = sorted(Object.keys(catalog));
      expect({ language, missing: french.filter((key) => !keys.includes(key)) }).toEqual({ language, missing: [] });
      expect({ language, extra: keys.filter((key) => !french.includes(key)) }).toEqual({ language, extra: [] });
    }
  });

  test('chaque valeur est un texte, jamais vide, jamais sa propre clé, avec les paramètres du français', async () => {
    const french = await loadConversationManageCatalog('fr');
    for (const [language, catalog] of await loadAll()) {
      for (const [key, value] of Object.entries(catalog)) {
        expect({ language, key, empty: value.trim().length === 0 || value === key }).toEqual({ language, key, empty: false });
        const expected = sorted(catalogPlaceholders(french[key as keyof ConversationManageCatalog]));
        expect({ language, key, params: sorted(catalogPlaceholders(value)) }).toEqual({ language, key, params: expected });
      }
    }
  });

  test('les phrases sont traduites, pas recopiées du français', async () => {
    const french = await loadConversationManageCatalog('fr');
    const phrases = [
      'conversationManage.members.search',
      'conversationManage.action.promote_moderator',
      'conversationManage.confirm.ban.body',
      'conversationManage.add.title',
      'conversationManage.settings.section',
      'conversationManage.permissions.write_role',
      'conversationManage.permissions.announcement.subtitle',
      'conversationManage.options.custom_name.placeholder',
      'conversationManage.header.muted',
    ] as const;
    for (const [language, catalog] of await loadAll()) {
      if (language === 'fr') continue;
      for (const key of phrases) {
        expect({ language, key, copied: catalog[key] === french[key] }).toEqual({ language, key, copied: false });
      }
    }
  });
});

describe('translateConversationManage', () => {
  test('les mots d’iOS, à leur place dans chaque langue', async () => {
    await Promise.all([loadConversationManageCatalog('de'), loadConversationManageCatalog('fr')]);
    expect(isConversationManageCatalogLoaded('de')).toBe(true);
    expect(translateConversationManage('fr', 'conversationManage.action.promote_admin')).toBe('Promouvoir Admin');
    expect(translateConversationManage('fr', 'conversationManage.confirm.expel.title', { name: 'Nour' })).toBe('Expulser Nour ?');
    expect(translateConversationManage('de', 'conversationManage.add.submit.other', { count: '3' })).toBe('3 Personen hinzufügen');
  });
});
