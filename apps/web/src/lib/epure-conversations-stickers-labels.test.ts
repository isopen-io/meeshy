import { describe, expect, test } from 'bun:test';

import { loadConversationStatsCatalog } from '@/lib/i18n-conversation-stats-catalog';
import { loadInterfaceCatalog } from '@/lib/i18n-catalog';
import type { InterfaceCatalogKey } from '@/lib/i18n-catalog';
import { SUPPORTED_INTERFACE_LANGUAGES } from '@/lib/inline-interface-language-bootstrap.js';

/**
 * ÉPURE 2/3 (#18361, #17584) — un libellé NOMME ; l'explication passe derrière un (i).
 * Les trois états courts valent dans les sept langues, traduits, sans seconde moitié.
 */

const SHORT_KEYS = ['composer.sticker.empty', 'conversation.details.share.copied'] as const satisfies readonly InterfaceCatalogKey[];

describe('les libellés courts de la liste et du fil', () => {
  test('« Aucun message » : l’état vide des statistiques tient en une ligne, sans seconde moitié, dans chaque langue', async () => {
    for (const language of SUPPORTED_INTERFACE_LANGUAGES) {
      const text = (await loadConversationStatsCatalog(language))['conversationStats.empty'];
      expect({ language, split: /[—–:]/.test(text) }).toEqual({ language, split: false });
      expect({ language, short: text.split(/\s+/).length <= 3 }).toEqual({ language, short: true });
    }
  });

  test('les états vides et le retour de copie sont courts dans chaque langue', async () => {
    for (const language of SUPPORTED_INTERFACE_LANGUAGES) {
      const catalog = await loadInterfaceCatalog(language);
      for (const key of SHORT_KEYS) {
        expect({ language, key, split: /[—–:]/.test(catalog[key]) }).toEqual({ language, key, split: false });
      }
    }
    expect((await loadInterfaceCatalog('fr'))['composer.sticker.empty']).toBe('Aucun sticker');
    expect((await loadInterfaceCatalog('fr'))['conversation.details.share.copied']).toBe('Lien copié.');
  });

  test('les deux questions des (i) existent, traduites, dans chaque langue', async () => {
    const fr = await loadInterfaceCatalog('fr');
    expect(fr['composer.sticker.pasteHint.question']).toBe('Comment créer un sticker ?');
    expect(fr['composer.sticker.intent.question']).toBe('Que contient cette famille ?');
    for (const language of SUPPORTED_INTERFACE_LANGUAGES) {
      if (language === 'fr') continue;
      const catalog = await loadInterfaceCatalog(language);
      for (const key of ['composer.sticker.pasteHint.question', 'composer.sticker.intent.question'] as const) {
        expect({ language, key, copied: catalog[key] === fr[key] }).toEqual({ language, key, copied: false });
      }
    }
  });
});
