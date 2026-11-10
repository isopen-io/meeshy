import { describe, expect, test } from 'bun:test';

import {
  loadExternalConversationCatalog,
  translateExternalConversation,
  type ExternalConversationCatalog,
  type ExternalConversationCatalogKey,
} from './i18n-external-conversation-catalog';
import { SUPPORTED_INTERFACE_LANGUAGES } from './inline-interface-language-bootstrap.js';
import type { InterfaceLanguage } from './interface-language';

/**
 * #17118 — le français est la source des clés ; chaque autre langue en porte EXACTEMENT les mêmes, traduites,
 * et nomme le réseau tel qu'il s'écrit (« WhatsApp ») dans le titre de l'entrée.
 */

const loadAll = async (): Promise<ReadonlyArray<readonly [InterfaceLanguage, ExternalConversationCatalog]>> =>
  Promise.all(SUPPORTED_INTERFACE_LANGUAGES.map(async (language) => [language, await loadExternalConversationCatalog(language)] as const));

const sorted = (values: Iterable<string>): readonly string[] => [...values].sort();

describe('chaque langue porte toutes les clés du français, traduites', () => {
  test('mêmes clés, aucune valeur vide', async () => {
    const frenchKeys = sorted(Object.keys(await loadExternalConversationCatalog('fr')));
    for (const [language, catalog] of await loadAll()) {
      expect({ language, keys: sorted(Object.keys(catalog)) }).toEqual({ language, keys: frenchKeys });
      for (const [key, value] of Object.entries(catalog)) {
        expect({ language, key, empty: value.trim().length === 0 }).toEqual({ language, key, empty: false });
      }
    }
  });

  test('les textes sont traduits, pas recopiés du français', async () => {
    const french = await loadExternalConversationCatalog('fr');
    const keys: readonly ExternalConversationCatalogKey[] = ['externalConversation.entry.title', 'externalConversation.encrypted', 'externalConversation.phoneUnverified'];
    for (const [language, catalog] of await loadAll()) {
      if (language === 'fr') continue;
      for (const key of keys) expect({ language, key, copied: catalog[key] === french[key] }).toEqual({ language, key, copied: false });
    }
  });

  test('le titre de l’entrée nomme le réseau dans toutes les langues latines', async () => {
    for (const [language, catalog] of await loadAll()) {
      if (language === 'ar') continue;
      expect({ language, names: catalog['externalConversation.entry.title'].includes('WhatsApp') }).toEqual({ language, names: true });
    }
  });
});

describe('translateExternalConversation', () => {
  test('rend la langue demandée une fois chargée', async () => {
    await loadExternalConversationCatalog('en');
    expect(translateExternalConversation('en', 'externalConversation.submit')).toBe('Write');
  });
});
