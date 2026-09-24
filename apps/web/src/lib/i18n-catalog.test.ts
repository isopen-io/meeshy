import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import {
  catalogPlaceholders,
  loadInterfaceCatalog,
  suspendForInterfaceCatalog,
  translate,
  type InterfaceCatalog,
} from './i18n-catalog';
import { SUPPORTED_INTERFACE_LANGUAGES } from './inline-interface-language-bootstrap.js';
import { currentInterfaceLanguage, type InterfaceLanguage } from './interface-language';

beforeAll(() => {
  ensureHappyDomRegistered();
});

afterAll(async () => {
  await releaseHappyDomIfRegistered();
});

afterEach(() => {
  document.documentElement.lang = 'fr';
});

const loadAll = async (): Promise<ReadonlyArray<readonly [InterfaceLanguage, InterfaceCatalog]>> =>
  Promise.all(
    SUPPORTED_INTERFACE_LANGUAGES.map(async (language) => [language, await loadInterfaceCatalog(language)] as const),
  );

const sorted = (values: Iterable<string>): readonly string[] => [...values].sort();

describe('les sept langues servies par le produit', () => {
  test('sont celles du catalogue iOS, dans leur code d’interface web', () => {
    expect(sorted(SUPPORTED_INTERFACE_LANGUAGES)).toEqual(sorted(['fr', 'en', 'es', 'pt', 'de', 'it', 'ar']));
  });
});

/**
 * LE TÉMOIN QUI ROUGIT SUR UNE CLÉ MANQUANTE (#6206). Le français est la
 * source des clés ; chaque autre langue doit porter EXACTEMENT les mêmes, avec
 * les mêmes paramètres. Aucune valeur par défaut ne comble un trou : une clé
 * absente d'une langue fait tomber ce témoin, jamais l'affichage.
 *
 * « Non vide » et « différente de la clé » sont deux gardes distinctes : une
 * clé recopiée en valeur passerait un témoin de LANGUE (elle n'est pas du
 * français) tout en affichant un identifiant à l'utilisateur.
 */
describe('chaque langue porte toutes les clés du français, et rien d’autre', () => {
  test('mêmes clés', async () => {
    const catalogs = await loadAll();
    const french = sorted(Object.keys((await loadInterfaceCatalog('fr')) as Record<string, string>));
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
    const french = await loadInterfaceCatalog('fr');
    for (const [language, catalog] of await loadAll()) {
      for (const [key, value] of Object.entries(catalog)) {
        const expected = sorted(catalogPlaceholders(french[key as keyof InterfaceCatalog]));
        expect({ language, key, params: sorted(catalogPlaceholders(value)) }).toEqual({ language, key, params: expected });
      }
    }
  });
});

describe('translate — une clé, sa langue, ses paramètres', () => {
  test('fr rend le libellé français', async () => {
    await loadInterfaceCatalog('fr');
    expect(translate('fr', 'announce.messageSent')).toBe('Message envoyé');
    expect(translate('fr', 'announce.messagesCopied')).toBe('Messages copiés');
  });

  test('en rend un libellé DIFFÉRENT, pas une recopie du français', async () => {
    await loadInterfaceCatalog('en');
    expect(translate('en', 'announce.messageSent')).toBe('Message sent');
    expect(translate('en', 'announce.messageCopied')).toBe('Message copied');
  });

  /**
   * Les paramètres se placent là où la LANGUE les veut, jamais là où le site
   * d'appel les concatène : l'arabe met la conjonction collée au second nom.
   */
  test('les paramètres sont interpolés dans l’ordre de la langue', async () => {
    await Promise.all([loadInterfaceCatalog('en'), loadInterfaceCatalog('ar')]);
    expect(translate('en', 'typing.double', { first: 'Kwame', second: 'Fatou' })).toBe('Kwame and Fatou are typing');
    expect(translate('ar', 'typing.double', { first: 'Kwame', second: 'Fatou' })).toBe('Kwame وFatou يكتبان');
  });

  /**
   * LA FEUILLE DE LANGUE, TROIS TEXTES SYSTÈME (#6328) — avant ce lot,
   * `language-sheet.tsx` les écrivait en dur, en français, quelle que soit
   * l'interface (`components/language-sheet.tsx`, `composer.tsx`). Témoin de
   * COMPORTEMENT sur `translate()`, le même appel que le composant fait —
   * `i18n-catalog.test.ts` garde déjà la PARITÉ des sept catalogues ; ce
   * témoin garde le TEXTE exact d'une langue non française, pour que ce lot
   * ne repose pas uniquement sur `auth-screens.test.tsx` (rendu du défaut de
   * l'inscription) pour l'état vide, hors de portée d'un rendu statique.
   */
  test('languageSheet.* — allemand, jamais une recopie du français', async () => {
    await loadInterfaceCatalog('de');
    expect(translate('de', 'languageSheet.title.read')).toBe('Lesesprache');
    expect(translate('de', 'languageSheet.title.write')).toBe('Schreibsprache');
    expect(translate('de', 'languageSheet.search')).toBe('Sprache suchen');
    expect(translate('de', 'languageSheet.empty', { search: 'xy' })).toBe('Keine Sprache passt zu „xy“.');
  });
});

/**
 * LE GATE DU CRITÈRE DE FIN (#6206) : « au moins une seconde langue s'affiche
 * réellement ». Ce témoin compose exactement l'appel des consommateurs —
 * `translate(currentInterfaceLanguage(), clé)` — pour qu'une rupture de la
 * chaîne résolution → chargement → catalogue le fasse tomber.
 */
describe('la chaîne résolution → catalogue sert réellement une seconde langue', () => {
  test('langue d’interface = de ⇒ le texte réellement composé est allemand', async () => {
    document.documentElement.lang = 'de';
    await loadInterfaceCatalog(currentInterfaceLanguage());
    expect(translate(currentInterfaceLanguage(), 'root.menu.settings')).toBe('Einstellungen');
  });

  test('langue d’interface = fr ⇒ le texte réellement composé est français', async () => {
    document.documentElement.lang = 'fr';
    await loadInterfaceCatalog(currentInterfaceLanguage());
    expect(translate(currentInterfaceLanguage(), 'root.menu.settings')).toBe('Réglages');
  });
});

/**
 * `suspendForInterfaceCatalog` — LECTURE EN MODE SUSPENSE (#6341), pour
 * `NotFound` (`routes/route-table.tsx`), seul écran qui peut se rendre sans
 * passer par `screenPrerequisite`. Le second témoin ne suppose PAS que sa
 * langue est encore hors cache — `bun test` partage le module entre fichiers
 * (`loadAll()` ci-dessus charge déjà les sept langues dans ce même fichier) —
 * il porte sur la PROMESSE jetée si elle l'est, et sur l'absence de jet une
 * fois le catalogue résolu, quel que soit l'état de départ.
 */
describe('suspendForInterfaceCatalog — #6341', () => {
  test('un catalogue déjà chargé ne jette rien', async () => {
    await loadInterfaceCatalog('fr');
    expect(() => suspendForInterfaceCatalog('fr')).not.toThrow();
  });

  test('jette la promesse en cours tant que non chargé, puis ne jette plus une fois résolu', async () => {
    let thrown: unknown;
    try {
      suspendForInterfaceCatalog('pt');
    } catch (error) {
      thrown = error;
    }
    if (thrown !== undefined) {
      expect(thrown).toBeInstanceOf(Promise);
      await thrown;
    }
    expect(() => suspendForInterfaceCatalog('pt')).not.toThrow();
  });
});
