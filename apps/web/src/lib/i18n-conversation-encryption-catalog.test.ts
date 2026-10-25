import { describe, expect, test } from 'bun:test';

import {
  isConversationEncryptionCatalogLoaded,
  loadConversationEncryptionCatalog,
  translateConversationEncryption,
  type ConversationEncryptionCatalog,
} from './i18n-conversation-encryption-catalog';
import { SUPPORTED_INTERFACE_LANGUAGES } from './inline-interface-language-bootstrap.js';
import type { InterfaceLanguage } from './interface-language';
import { FACT_KEY, REGIME_SUMMARY_KEY, TOPIC_KEY } from './view/conversation-encryption-explanation';

/**
 * LE CATALOGUE DU CHIFFREMENT D'UNE CONVERSATION (#12880) — même discipline
 * que les statistiques : le français est la source des clés
 * `conversationEncryption.*`, chaque langue porte EXACTEMENT les mêmes, aucune
 * phrase n'est laissée en français, et chaque clé que la section lit existe.
 */
const loadAll = async (): Promise<ReadonlyArray<readonly [InterfaceLanguage, ConversationEncryptionCatalog]>> =>
  Promise.all(SUPPORTED_INTERFACE_LANGUAGES.map(async (language) => [language, await loadConversationEncryptionCatalog(language)] as const));

const sorted = (values: Iterable<string>): readonly string[] => [...values].sort();

describe('chaque langue porte toutes les clés conversationEncryption.* du français, et rien d’autre', () => {
  test('mêmes clés, textes non vides, traduits', async () => {
    const french = await loadConversationEncryptionCatalog('fr');
    const frenchKeys = sorted(Object.keys(french));
    for (const [language, catalog] of await loadAll()) {
      expect({ language, keys: sorted(Object.keys(catalog)) }).toEqual({ language, keys: frenchKeys });
      for (const [key, value] of Object.entries(catalog)) {
        expect({ language, key, empty: value.trim().length === 0 || value === key }).toEqual({ language, key, empty: false });
        if (language !== 'fr' && key !== 'conversationEncryption.section') {
          expect({ language, key, copied: value === french[key as keyof ConversationEncryptionCatalog] }).toEqual({ language, key, copied: false });
        }
      }
    }
  });

  test('chaque clé lue par la section existe, et aucune clé du catalogue n’est orpheline', async () => {
    const french = await loadConversationEncryptionCatalog('fr');
    const read = new Set<string>(['conversationEncryption.section', ...Object.values(REGIME_SUMMARY_KEY), ...Object.values(TOPIC_KEY), ...Object.values(FACT_KEY)]);
    expect(sorted(read)).toEqual(sorted(Object.keys(french)));
  });

  test('un catalogue chargé se lit dans sa langue', async () => {
    await loadConversationEncryptionCatalog('de');
    expect(isConversationEncryptionCatalogLoaded('de')).toBe(true);
    expect(translateConversationEncryption('de', 'conversationEncryption.section')).toBe('Verschlüsselung');
  });
});
