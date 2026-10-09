import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { INTERFACE_LANGUAGE_KEY } from './inline-interface-language-bootstrap.js';
import { followBrowserInterfaceLanguage, setInterfaceLanguage } from './interface-language';
import type { CoqueNative } from './native-shell';
import { syncShellLocaleAtStart } from './shell-locale';

/**
 * LA LANGUE CHOISIE DANS MEESHY GAGNE AUSSI LES TEXTES NATIFS DE LA COQUE
 * ANDROID (#9749). Sur le web, tout ce que l'utilisateur lit est écrit par
 * l'application, donc dans sa langue d'interface. Dans la coque, « Appel en
 * cours », la lecture, l'enregistrement et les canaux de notification sont
 * écrits par Android, dans la langue du téléphone : le choix fait dans Meeshy
 * part donc aussi vers `MeeshyLocale.setLocales`.
 */

type Appel = { readonly plugin: string; readonly methode: string; readonly options: object };

function coque(appels: Appel[], methodes: readonly string[] = ['setLocales'], echec = false): CoqueNative {
  return {
    PluginHeaders: [{ name: 'MeeshyLocale', methods: methodes.map((name) => ({ name })) }],
    nativePromise: (plugin, methode, options) => {
      appels.push({ plugin, methode, options });
      return echec ? Promise.reject(new Error('refus')) : Promise.resolve({});
    },
  };
}

function installer(hote: CoqueNative | undefined): void {
  (globalThis as { Capacitor?: CoqueNative }).Capacitor = hote;
}

beforeAll(() => {
  ensureHappyDomRegistered();
});

afterAll(async () => {
  await releaseHappyDomIfRegistered();
});

afterEach(() => {
  installer(undefined);
  document.documentElement.lang = 'fr';
  document.documentElement.dir = 'ltr';
  try {
    localStorage.removeItem(INTERFACE_LANGUAGE_KEY);
  } catch {
    /* rien à nettoyer */
  }
});

describe('le choix de langue part vers la coque (#9749)', () => {
  test('choisir l’allemand le donne aux textes natifs', async () => {
    const appels: Appel[] = [];
    installer(coque(appels));
    await setInterfaceLanguage('de');
    expect(appels).toEqual([{ plugin: 'MeeshyLocale', methode: 'setLocales', options: { tag: 'de', ifUnset: false } }]);
  });

  test('« Automatique » rend les textes natifs à la langue du téléphone', async () => {
    const appels: Appel[] = [];
    installer(coque(appels));
    await followBrowserInterfaceLanguage(['en-US']);
    expect(appels).toEqual([{ plugin: 'MeeshyLocale', methode: 'setLocales', options: { tag: '', ifUnset: false } }]);
  });

  test('un navigateur, ou une coque sans la méthode, ne reçoit rien et l’interface change quand même', async () => {
    const appels: Appel[] = [];
    installer(coque(appels, []));
    await setInterfaceLanguage('it');
    installer(undefined);
    await setInterfaceLanguage('es');
    expect(appels).toEqual([]);
    expect(document.documentElement.lang).toBe('es');
  });

  test('un refus de la coque ne fait pas échouer le changement de langue', async () => {
    installer(coque([], ['setLocales'], true));
    await setInterfaceLanguage('pt');
    expect(document.documentElement.lang).toBe('pt');
  });
});

describe('au démarrage, un choix déjà fait rejoint la coque sans écraser le réglage d’Android (#9749)', () => {
  test('un choix enregistré part, seulement si la coque n’a encore aucune langue', async () => {
    const appels: Appel[] = [];
    localStorage.setItem(INTERFACE_LANGUAGE_KEY, 'ar');
    await syncShellLocaleAtStart(coque(appels));
    expect(appels).toEqual([{ plugin: 'MeeshyLocale', methode: 'setLocales', options: { tag: 'ar', ifUnset: true } }]);
  });

  test('en « Automatique », rien ne part : la langue choisie dans les réglages d’Android reste', async () => {
    const appels: Appel[] = [];
    await syncShellLocaleAtStart(coque(appels));
    expect(appels).toEqual([]);
  });
});
