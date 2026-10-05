import { describe, expect, test } from 'bun:test';

import { catalogPlaceholders } from './i18n-catalog';
import { loadSendSheetCatalog, translateSendSheet, type SendSheetCatalog } from './i18n-send-sheet-catalog';
import { SUPPORTED_INTERFACE_LANGUAGES } from './inline-interface-language-bootstrap.js';
import type { InterfaceLanguage } from './interface-language';

/**
 * LE CATALOGUE DE LA FEUILLE D'ENVOI (#8884) — même discipline que
 * `i18n-call-controls-catalog.test.ts` : le français est la source des clés,
 * chaque autre langue en porte EXACTEMENT les mêmes, avec les mêmes paramètres,
 * et aucune valeur n'est vide, recopiée de sa clé ou laissée en français.
 */
const loadAll = async (): Promise<ReadonlyArray<readonly [InterfaceLanguage, SendSheetCatalog]>> =>
  Promise.all(SUPPORTED_INTERFACE_LANGUAGES.map(async (language) => [language, await loadSendSheetCatalog(language)] as const));

const sorted = (values: Iterable<string>): readonly string[] => [...values].sort();

describe('chaque langue porte toutes les clés du français, et rien d’autre', () => {
  test('les sept langues du produit', async () => {
    expect(sorted(SUPPORTED_INTERFACE_LANGUAGES)).toEqual(['ar', 'de', 'en', 'es', 'fr', 'it', 'pt']);
  });

  test('mêmes clés', async () => {
    const french = sorted(Object.keys(await loadSendSheetCatalog('fr')));
    for (const [language, catalog] of await loadAll()) {
      const keys = sorted(Object.keys(catalog));
      expect({ language, missing: french.filter((key) => !keys.includes(key)) }).toEqual({ language, missing: [] });
      expect({ language, extra: keys.filter((key) => !french.includes(key)) }).toEqual({ language, extra: [] });
    }
  });

  test('chaque valeur est un texte, jamais vide, jamais sa propre clé, avec les paramètres du français', async () => {
    const french = await loadSendSheetCatalog('fr');
    for (const [language, catalog] of await loadAll()) {
      for (const [key, value] of Object.entries(catalog)) {
        expect({ language, key, empty: value.trim().length === 0 || value === key }).toEqual({ language, key, empty: false });
        const expected = sorted(catalogPlaceholders(french[key as keyof SendSheetCatalog]));
        expect({ language, key, params: sorted(catalogPlaceholders(value)) }).toEqual({ language, key, params: expected });
      }
    }
  });

  test('les textes affichés sont traduits, pas recopiés du français', async () => {
    const french = await loadSendSheetCatalog('fr');
    for (const [language, catalog] of await loadAll()) {
      if (language === 'fr') continue;
      for (const key of ['sendSheet.cancel', 'sendSheet.caption.placeholder', 'sendSheet.search.label', 'sendSheet.state.waitingNetwork', 'sendSheet.protected', 'shareLinkSheet.title'] as const) {
        expect({ language, key, copied: catalog[key] === french[key] }).toEqual({ language, key, copied: false });
      }
    }
  });
});

describe('translateSendSheet', () => {
  test('interpole le nombre de destinataires', async () => {
    await loadSendSheetCatalog('fr');
    expect(translateSendSheet('fr', 'sendSheet.sendCount', { count: '3' })).toBe('Envoyer (3)');
    expect(translateSendSheet('fr', 'sendSheet.announce.sent', { count: '2' })).toBe('Envoyé à 2');
    expect(translateSendSheet('fr', 'sendSheet.limit.recipients', { count: '10' })).toBe('10 destinataires au plus');
  });

  test('l’anglais est servi quand il est chargé', async () => {
    await loadSendSheetCatalog('en');
    expect(translateSendSheet('en', 'sendSheet.cancel')).toBe('Cancel');
  });

  test('une langue pas encore chargée sert une langue déjà chargée, sans lever', async () => {
    await loadSendSheetCatalog('fr');
    expect(translateSendSheet('ar', 'sendSheet.cancel')).toMatch(/Annuler|Cancel|إلغاء/);
  });
});
