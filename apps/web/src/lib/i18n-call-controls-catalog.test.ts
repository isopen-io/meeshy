import { describe, expect, test } from 'bun:test';

import { catalogPlaceholders } from './i18n-catalog';
import { loadCallControlsCatalog, translateCallControls, type CallControlsCatalog } from './i18n-call-controls-catalog';
import { SUPPORTED_INTERFACE_LANGUAGES } from './inline-interface-language-bootstrap.js';
import type { InterfaceLanguage } from './interface-language';

/**
 * LE CATALOGUE DES CONTRÔLES D'APPEL (#8433, #8438, #8439, #8437) — même discipline que
 * `i18n-invite-catalog.test.ts` : le français est la source des clés, chaque
 * autre langue en porte EXACTEMENT les mêmes, avec les mêmes paramètres, et
 * aucune valeur n'est vide, recopiée de sa clé ou laissée en français.
 */

const loadAll = async (): Promise<ReadonlyArray<readonly [InterfaceLanguage, CallControlsCatalog]>> =>
  Promise.all(SUPPORTED_INTERFACE_LANGUAGES.map(async (language) => [language, await loadCallControlsCatalog(language)] as const));

const sorted = (values: Iterable<string>): readonly string[] => [...values].sort();

describe('chaque langue porte toutes les clés du français, et rien d’autre', () => {
  test('mêmes clés', async () => {
    const french = sorted(Object.keys(await loadCallControlsCatalog('fr')));
    for (const [language, catalog] of await loadAll()) {
      const keys = sorted(Object.keys(catalog));
      expect({ language, missing: french.filter((key) => !keys.includes(key)) }).toEqual({ language, missing: [] });
      expect({ language, extra: keys.filter((key) => !french.includes(key)) }).toEqual({ language, extra: [] });
    }
  });

  test('chaque valeur est un texte, jamais vide, jamais sa propre clé, avec les paramètres du français', async () => {
    const french = await loadCallControlsCatalog('fr');
    for (const [language, catalog] of await loadAll()) {
      for (const [key, value] of Object.entries(catalog)) {
        expect({ language, key, empty: value.trim().length === 0 || value === key }).toEqual({ language, key, empty: false });
        const expected = sorted(catalogPlaceholders(french[key as keyof CallControlsCatalog]));
        expect({ language, key, params: sorted(catalogPlaceholders(value)) }).toEqual({ language, key, params: expected });
      }
    }
  });

  test('les textes affichés sont traduits, pas recopiés du français', async () => {
    const french = await loadCallControlsCatalog('fr');
    for (const [language, catalog] of await loadAll()) {
      if (language === 'fr') continue;
      for (const key of ['callControls.invite.label', 'callControls.mutedBy', 'callControls.remove.confirm', 'callControls.record.video', 'callControls.incomingInvite'] as const) {
        expect({ language, key, copied: catalog[key] === french[key] }).toEqual({ language, key, copied: false });
      }
    }
  });
});

describe('translateCallControls', () => {
  test('interpole le nom de qui coupe le micro', async () => {
    await loadCallControlsCatalog('fr');
    expect(translateCallControls('fr', 'callControls.mutedBy', { name: 'Nadia' })).toBe('Nadia a coupé votre micro');
  });

  test('une langue pas encore chargée sert une langue déjà chargée, sans lever', async () => {
    await loadCallControlsCatalog('fr');
    expect(translateCallControls('it', 'callControls.react')).toMatch(/Réagir|Reagisci/);
  });
});
