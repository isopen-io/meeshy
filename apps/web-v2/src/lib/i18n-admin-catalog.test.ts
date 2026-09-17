import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import {
  loadAdminInterfaceCatalog,
  suspendForAdminInterfaceCatalog,
  translateAdmin,
  type AdminInterfaceCatalog,
} from './i18n-admin-catalog';
import { catalogPlaceholders } from './i18n-catalog';
import { SUPPORTED_INTERFACE_LANGUAGES } from './inline-interface-language-bootstrap.js';
import type { InterfaceLanguage } from './interface-language';

beforeAll(() => {
  ensureHappyDomRegistered();
});

afterAll(async () => {
  await releaseHappyDomIfRegistered();
});

afterEach(() => {
  document.documentElement.lang = 'fr';
});

const loadAll = async (): Promise<ReadonlyArray<readonly [InterfaceLanguage, AdminInterfaceCatalog]>> =>
  Promise.all(
    SUPPORTED_INTERFACE_LANGUAGES.map(async (language) => [language, await loadAdminInterfaceCatalog(language)] as const),
  );

const sorted = (values: Iterable<string>): readonly string[] => [...values].sort();

/**
 * LE TÉMOIN QUI ROUGIT SUR UNE CLÉ MANQUANTE — même discipline que
 * `i18n-catalog.test.ts` (#6206), appliquée au second catalogue (#6871,
 * #6834) : le français est la source des clés `admin.*`, chaque autre langue
 * en porte EXACTEMENT les mêmes, avec les mêmes paramètres.
 */
describe('chaque langue porte toutes les clés admin.* du français, et rien d’autre', () => {
  test('mêmes clés', async () => {
    const catalogs = await loadAll();
    const french = sorted(Object.keys((await loadAdminInterfaceCatalog('fr')) as Record<string, string>));
    for (const [language, catalog] of catalogs) {
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
    const french = await loadAdminInterfaceCatalog('fr');
    for (const [language, catalog] of await loadAll()) {
      for (const [key, value] of Object.entries(catalog)) {
        const expected = sorted(catalogPlaceholders(french[key as keyof AdminInterfaceCatalog]));
        expect({ language, key, params: sorted(catalogPlaceholders(value)) }).toEqual({ language, key, params: expected });
      }
    }
  });

  /** `admin.title` reste dans le catalogue COMMUN (#6871) : la rangée des
   * Réglages et le menu flottant le lisent sans jamais entrer dans un écran
   * d'administration. Un retour ici serait la régression que ce lot corrige. */
  test('admin.title n’y figure pas — il reste dans le catalogue commun', async () => {
    const french = await loadAdminInterfaceCatalog('fr');
    expect(Object.keys(french)).not.toContain('admin.title');
  });
});

describe('translateAdmin — une clé, sa langue, ses paramètres', () => {
  test('fr rend le libellé français', async () => {
    await loadAdminInterfaceCatalog('fr');
    expect(translateAdmin('fr', 'admin.ban.title')).toBe('Bannir ce membre');
  });

  test('en rend un libellé DIFFÉRENT, pas une recopie du français', async () => {
    await loadAdminInterfaceCatalog('en');
    expect(translateAdmin('en', 'admin.ban.title')).toBe('Ban this member');
  });

  test('les paramètres sont interpolés', async () => {
    await loadAdminInterfaceCatalog('en');
    expect(translateAdmin('en', 'admin.users.count', { count: '12' })).toBe('12 account(s)');
  });
});

describe('suspendForAdminInterfaceCatalog', () => {
  test('un catalogue déjà chargé ne jette rien', async () => {
    await loadAdminInterfaceCatalog('fr');
    expect(() => suspendForAdminInterfaceCatalog('fr')).not.toThrow();
  });

  test('jette la promesse en cours tant que non chargé, puis ne jette plus une fois résolu', async () => {
    let thrown: unknown;
    try {
      suspendForAdminInterfaceCatalog('it');
    } catch (error) {
      thrown = error;
    }
    if (thrown !== undefined) {
      expect(thrown).toBeInstanceOf(Promise);
      await thrown;
    }
    expect(() => suspendForAdminInterfaceCatalog('it')).not.toThrow();
  });
});
