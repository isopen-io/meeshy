import { describe, expect, test } from 'bun:test';

import { type InterfaceCatalogKey, loadInterfaceCatalog } from '@/lib/i18n-catalog';
import { SUPPORTED_INTERFACE_LANGUAGES as INTERFACE_LANGUAGES } from '@/lib/inline-interface-language-bootstrap.js';

/**
 * ÉPURE 1/3 (#18196) — les libellés courts du lot « découvrir, profil, états
 * vides » sont ceux du lexique (`docs/product/epure-lexique.md`), traduits
 * dans les sept langues, jamais copiés du français.
 */
const LEXIQUE: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  'activation.phone.add': { fr: 'Ajouter', en: 'Add', es: 'Añadir', pt: 'Adicionar', de: 'Hinzufügen', it: 'Aggiungi', ar: 'إضافة' },
  'community.create.button': { fr: 'Créer', en: 'Create', es: 'Crear', pt: 'Criar', de: 'Erstellen', it: 'Crea', ar: 'إنشاء' },
};

describe('libellés courts du lexique (#18196)', () => {
  for (const [key, byLanguage] of Object.entries(LEXIQUE)) {
    test(`« ${key} » est le mot du lexique dans les sept langues`, async () => {
      expect(INTERFACE_LANGUAGES.length).toBe(7);
      for (const language of INTERFACE_LANGUAGES) {
        const catalog = await loadInterfaceCatalog(language);
        expect(catalog[key as InterfaceCatalogKey]).toBe(byLanguage[language]!);
      }
    });
  }

  test('la phrase du numéro n’a plus de pronom orphelin et reste complète', async () => {
    const fr = await loadInterfaceCatalog('fr');
    const body = fr['phonePrompt.body'];
    expect(body).toContain('vous retrouveront sur Meeshy');
    expect(body.endsWith(' avec.')).toBe(false);
    expect(body).toContain('connecter');
  });

  test('« demande envoyée » tient en une phrase courte, dans les sept langues', async () => {
    for (const language of INTERFACE_LANGUAGES) {
      const catalog = await loadInterfaceCatalog(language);
      const text = catalog['userProfile.context.sent'];
      expect(text).toContain('{name}');
      expect(text.split(/[.。]/).filter((part) => part.trim() !== '').length).toBe(1);
      expect(text.length).toBeLessThan(40);
    }
    expect((await loadInterfaceCatalog('fr'))['userProfile.context.sent']).toBe('Demande envoyée à {name}.');
  });
});
