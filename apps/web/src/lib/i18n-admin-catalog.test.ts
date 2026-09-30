import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import {
  ADMIN_LANGUAGES,
  adminLanguageOf,
  currentAdminLanguage,
  loadAdminInterfaceCatalog,
  suspendForAdminInterfaceCatalog,
  translateAdmin,
  translateAdminMaybe,
  type AdminInterfaceCatalog,
  type AdminLanguage,
} from './i18n-admin-catalog';
import { catalogPlaceholders, translate } from './i18n-catalog';
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

const loadAll = async (): Promise<ReadonlyArray<readonly [AdminLanguage, AdminInterfaceCatalog]>> =>
  Promise.all(ADMIN_LANGUAGES.map(async (language) => [language, await loadAdminInterfaceCatalog(language)] as const));

const sorted = (values: Iterable<string>): readonly string[] => [...values].sort();

/**
 * **L'ADMINISTRATION PARLE QUATRE LANGUES** (directive porteur 2026-09-30 :
 * « l'espace administrateur a besoin d'être en français, anglais, portugais
 * et espagnol, c'est tout »). Une langue d'interface hors de ces quatre lit
 * l'administration en ANGLAIS — textes et formats — jamais dans sa propre
 * langue, et il n'existe plus aucun catalogue d'administration allemand,
 * italien ni arabe.
 *
 * Les sept entrées sont écrites ICI, à la main : un attendu relu dans la table
 * de production serait vert sur une table fausse.
 */
describe('adminLanguageOf — une seule règle pour les sept langues d’interface', () => {
  const EXPECTED: Readonly<Record<InterfaceLanguage, AdminLanguage>> = {
    fr: 'fr',
    en: 'en',
    es: 'es',
    pt: 'pt',
    de: 'en',
    it: 'en',
    ar: 'en',
  };

  test('la table attendue couvre les sept langues d’interface, ni plus ni moins', () => {
    expect(sorted(Object.keys(EXPECTED))).toEqual(sorted(SUPPORTED_INTERFACE_LANGUAGES));
  });

  for (const language of SUPPORTED_INTERFACE_LANGUAGES) {
    test(`${language} → ${EXPECTED[language]}`, () => {
      expect(adminLanguageOf(language)).toBe(EXPECTED[language]);
    });
  }

  test('une langue inconnue se lit en anglais, jamais en erreur', () => {
    expect(adminLanguageOf('zh')).toBe('en');
    expect(adminLanguageOf('')).toBe('en');
  });

  test('les langues de l’administration sont exactement fr, en, es, pt', () => {
    expect(sorted(ADMIN_LANGUAGES)).toEqual(['en', 'es', 'fr', 'pt']);
  });
});

describe('currentAdminLanguage — la langue d’interface du document, passée par la règle', () => {
  test('une langue servie par l’administration est lue telle quelle', () => {
    for (const language of ADMIN_LANGUAGES) {
      document.documentElement.lang = language;
      expect(currentAdminLanguage()).toBe(language);
    }
  });

  test('de, it et ar lisent l’administration en anglais', () => {
    for (const language of ['de', 'it', 'ar'] as const) {
      document.documentElement.lang = language;
      expect(currentAdminLanguage()).toBe('en');
    }
  });
});

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

describe('une langue d’interface hors des quatre lit le catalogue ANGLAIS', () => {
  test('charger de, it ou ar charge — et rend — le catalogue anglais', async () => {
    const english = await loadAdminInterfaceCatalog('en');
    for (const language of ['de', 'it', 'ar'] as const) {
      expect(await loadAdminInterfaceCatalog(language)).toBe(english);
    }
  });

  test('translateAdmin répond en anglais à de, it et ar — défense en profondeur d’un appelant égaré', async () => {
    await loadAdminInterfaceCatalog('de');
    for (const language of ['de', 'it', 'ar'] as const) {
      expect(translateAdmin(language, 'admin.ban.title')).toBe('Ban this member');
      expect(translateAdmin(language, 'admin.users.count', { count: '12' })).toBe('12 account(s)');
      expect(translateAdminMaybe(language, 'admin.enum.role.BIGBOSS')).toBe('Creator');
    }
  });

  test('pt et es gardent leur propre langue', async () => {
    await Promise.all([loadAdminInterfaceCatalog('pt'), loadAdminInterfaceCatalog('es')]);
    expect(translateAdmin('pt', 'admin.ban.title')).not.toBe(translateAdmin('en', 'admin.ban.title'));
    expect(translateAdmin('es', 'admin.ban.title')).not.toBe(translateAdmin('en', 'admin.ban.title'));
    expect(translateAdminMaybe('pt', 'admin.enum.role.BIGBOSS')).toBe('Criador');
    expect(translateAdminMaybe('es', 'admin.enum.role.BIGBOSS')).toBe('Creador');
  });
});

/**
 * Le catalogue COMMUN se lit aussi dans l'administration (`admin.title`,
 * `pending.back`, `common.cancel`) : dans la langue de l'ADMINISTRATION, pas
 * dans celle de l'interface. Sans ce chargement, un lecteur allemand qui
 * ouvre l'administration en anglais lirait un catalogue commun anglais jamais
 * chargé — `translate` lève, et l'écran ne se peint pas.
 */
describe('charger l’administration charge aussi le catalogue commun de SA langue', () => {
  test('un lecteur allemand peut lire le catalogue commun anglais', async () => {
    await loadAdminInterfaceCatalog('de');
    expect(translate('en', 'admin.title')).toBe('Administration');
    expect(translate('en', 'common.cancel')).toBe('Cancel');
  });

  test('et les trois autres langues de l’administration', async () => {
    await Promise.all(ADMIN_LANGUAGES.map((language) => loadAdminInterfaceCatalog(language)));
    for (const language of ADMIN_LANGUAGES) {
      expect(translate(language, 'common.cancel').length).toBeGreaterThan(0);
    }
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
      suspendForAdminInterfaceCatalog('es');
    } catch (error) {
      thrown = error;
    }
    if (thrown !== undefined) {
      expect(thrown).toBeInstanceOf(Promise);
      await thrown;
    }
    expect(() => suspendForAdminInterfaceCatalog('es')).not.toThrow();
  });

  test('de se suspend sur le catalogue anglais, qu’aucun catalogue allemand ne remplace', async () => {
    let thrown: unknown;
    try {
      suspendForAdminInterfaceCatalog('de');
    } catch (error) {
      thrown = error;
    }
    if (thrown !== undefined) await thrown;
    expect(() => suspendForAdminInterfaceCatalog('de')).not.toThrow();
    expect(() => suspendForAdminInterfaceCatalog('en')).not.toThrow();
  });
});

/**
 * LA LECTURE TOLÉRANTE (#8876) — la bibliothèque d'interprétation COMPOSE ses
 * clés (`admin.enum.<famille>.<code>`) depuis un code servi : une clé absente se
 * dit `null`, jamais une exception ni une chaîne vide.
 */
describe('translateAdminMaybe', () => {
  test('rend le texte d’une clé connue, dans la langue demandée', async () => {
    await loadAll();
    expect(translateAdminMaybe('fr', 'admin.enum.role.BIGBOSS')).toBe('Créateur');
    expect(translateAdminMaybe('en', 'admin.enum.role.BIGBOSS')).toBe('Creator');
  });

  test('rend null pour une clé que le catalogue ne porte pas — y compris une clé héritée du prototype', async () => {
    await loadAll();
    expect(translateAdminMaybe('fr', 'admin.enum.role.SUPERVILLAIN')).toBeNull();
    expect(translateAdminMaybe('fr', 'toString')).toBeNull();
    expect(translateAdminMaybe('fr', '')).toBeNull();
  });
});
