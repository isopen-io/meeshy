import { describe, expect, test } from 'bun:test';

import { catalogPlaceholders } from './i18n-catalog';
import { loadInviteCatalog, translateInvite, type InviteCatalog } from './i18n-invite-catalog';
import { SUPPORTED_INTERFACE_LANGUAGES } from './inline-interface-language-bootstrap.js';
import type { InterfaceLanguage } from './interface-language';

/**
 * LE CATALOGUE DES INVITATIONS (#7796, #7797) — même discipline que
 * `i18n-onboarding-catalog.test.ts` : le français est la source des clés
 * `invite.*` et `linkDetail.*`, chaque autre langue en porte EXACTEMENT les
 * mêmes, avec les mêmes paramètres, et aucune valeur n'est vide ni recopiée de
 * sa clé. Une clé absente rougit ICI, jamais un texte français servi en
 * silence aux six autres langues.
 */

const loadAll = async (): Promise<ReadonlyArray<readonly [InterfaceLanguage, InviteCatalog]>> =>
  Promise.all(SUPPORTED_INTERFACE_LANGUAGES.map(async (language) => [language, await loadInviteCatalog(language)] as const));

const sorted = (values: Iterable<string>): readonly string[] => [...values].sort();

describe('chaque langue porte toutes les clés du français, et rien d’autre', () => {
  test('mêmes clés', async () => {
    const french = sorted(Object.keys(await loadInviteCatalog('fr')));
    for (const [language, catalog] of await loadAll()) {
      const keys = sorted(Object.keys(catalog));
      expect({ language, missing: french.filter((key) => !keys.includes(key)) }).toEqual({ language, missing: [] });
      expect({ language, extra: keys.filter((key) => !french.includes(key)) }).toEqual({ language, extra: [] });
    }
  });

  test('chaque valeur est un texte, jamais vide, jamais sa propre clé', async () => {
    for (const [language, catalog] of await loadAll()) {
      for (const [key, value] of Object.entries(catalog)) {
        expect({ language, key, empty: value.trim().length === 0 }).toEqual({ language, key, empty: false });
        expect({ language, key, identifier: value === key }).toEqual({ language, key, identifier: false });
      }
    }
  });

  test('chaque valeur porte les MÊMES paramètres que le français', async () => {
    const french = await loadInviteCatalog('fr');
    for (const [language, catalog] of await loadAll()) {
      for (const [key, value] of Object.entries(catalog)) {
        const expected = sorted(catalogPlaceholders(french[key as keyof InviteCatalog]));
        expect({ language, key, params: sorted(catalogPlaceholders(value)) }).toEqual({ language, key, params: expected });
      }
    }
  });

  test('les textes affichés sont traduits, pas recopiés du français', async () => {
    const french = await loadInviteCatalog('fr');
    for (const [language, catalog] of await loadAll()) {
      if (language === 'fr') continue;
      for (const key of ['invite.rights.title', 'invite.guest.continue', 'linkDetail.edit.save', 'linkDetail.delete.title'] as const) {
        expect({ language, key, copied: catalog[key] === french[key] }).toEqual({ language, key, copied: false });
      }
    }
  });
});

describe('l’arabe — « N / M » ne se retourne pas', () => {
  test('chaque fraction est dans un isolat LTR (U+2066 … U+2069)', async () => {
    const arabic = await loadInviteCatalog('ar');
    for (const [key, value] of Object.entries(arabic)) {
      const bare = value.replace(/⁦[^⁩]*⁩/gu, '');
      expect({ key, fraction: /(\d|\})\s*\/\s*(\d|\{)/u.test(bare) }).toEqual({ key, fraction: false });
    }
  });
});

describe('translateInvite', () => {
  test('interpole les paramètres', async () => {
    await loadInviteCatalog('fr');
    expect(translateInvite('fr', 'invite.inviter.named', { name: 'Priya' })).toBe('Priya t’invite');
  });
});
