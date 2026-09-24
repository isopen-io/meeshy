import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { translate } from './i18n-catalog';
import {
  INLINE_INTERFACE_LANGUAGE_BOOTSTRAP,
  INTERFACE_LANGUAGE_KEY,
  resolveInterfaceLanguageCode,
} from './inline-interface-language-bootstrap.js';
import {
  currentInterfaceLanguage,
  followBrowserInterfaceLanguage,
  interfaceLanguageChoice,
  setInterfaceLanguage,
  subscribeInterfaceLanguage,
} from './interface-language';

/**
 * LE CHOIX DE LA LANGUE D'INTERFACE, DEPUIS LES RÉGLAGES (#5563) — miroir
 * `SettingsView.interfaceLanguageRow` : « Automatique » ou l'une des sept.
 *
 * Trois comportements que l'écran ne peut pas tenir seul :
 *  1. « Automatique » est l'ABSENCE de choix stocké, et se résout par LA MÊME
 *     règle que le script d'amorçage — jamais une seconde écriture divergente ;
 *  2. un changement se NOTIFIE, pour que l'application entière se redessine
 *     dans la nouvelle langue sans rechargement ;
 *  3. la notification part APRÈS que la langue est posée et son catalogue
 *     chargé — un abonné qui relit la langue la trouve déjà servie.
 */

beforeAll(() => {
  ensureHappyDomRegistered();
});

afterAll(async () => {
  await releaseHappyDomIfRegistered();
});

afterEach(() => {
  document.documentElement.lang = 'fr';
  localStorage.removeItem(INTERFACE_LANGUAGE_KEY);
});

describe('interfaceLanguageChoice — le choix EXPLICITE, ou null pour « Automatique »', () => {
  test('rien de stocké ⇒ null', () => {
    expect(interfaceLanguageChoice()).toBeNull();
  });

  test('une langue cataloguée stockée ⇒ cette langue', () => {
    localStorage.setItem(INTERFACE_LANGUAGE_KEY, 'de');
    expect(interfaceLanguageChoice()).toBe('de');
  });

  test('une langue non cataloguée stockée n’est pas un choix ⇒ null', () => {
    localStorage.setItem(INTERFACE_LANGUAGE_KEY, 'sw');
    expect(interfaceLanguageChoice()).toBeNull();
  });
});

describe('followBrowserInterfaceLanguage — « Automatique » retire le choix et suit le navigateur', () => {
  test('retire le choix stocké et pose la première langue cataloguée du navigateur', async () => {
    await setInterfaceLanguage('it');
    await followBrowserInterfaceLanguage(['ja-JP', 'es-MX', 'en']);
    expect(localStorage.getItem(INTERFACE_LANGUAGE_KEY)).toBeNull();
    expect(currentInterfaceLanguage()).toBe('es');
    expect(interfaceLanguageChoice()).toBeNull();
  });

  test('le catalogue de la langue résolue est chargé avant qu’elle ne soit posée', async () => {
    await followBrowserInterfaceLanguage(['pt-BR']);
    expect(translate(currentInterfaceLanguage(), 'root.menu.settings')).toBe('Ajustes');
  });

  test('aucune langue du navigateur n’est cataloguée ⇒ le défaut du produit', async () => {
    await followBrowserInterfaceLanguage(['ja-JP', 'ko']);
    expect(currentInterfaceLanguage()).toBe('fr');
  });
});

describe('subscribeInterfaceLanguage — l’application se redessine au changement', () => {
  test('un abonné est prévenu APRÈS que la nouvelle langue est posée', async () => {
    const seen: string[] = [];
    const unsubscribe = subscribeInterfaceLanguage(() => seen.push(currentInterfaceLanguage()));
    await setInterfaceLanguage('ar');
    await followBrowserInterfaceLanguage(['en-GB']);
    unsubscribe();
    expect(seen).toEqual(['ar', 'en']);
  });

  test('un abonné retiré n’est plus prévenu', async () => {
    const seen: string[] = [];
    const unsubscribe = subscribeInterfaceLanguage(() => seen.push(currentInterfaceLanguage()));
    unsubscribe();
    await setInterfaceLanguage('de');
    expect(seen).toEqual([]);
  });
});

/**
 * LA RÈGLE « AUTOMATIQUE » N'A QU'UNE DÉFINITION. Le script d'amorçage est une
 * CHAÎNE (il s'injecte avant tout module), la résolution des réglages une
 * FONCTION : ce témoin exécute les deux sur les mêmes cas, et rougit au premier
 * écart entre elles.
 */
describe('resolveInterfaceLanguageCode — la même règle que le script d’amorçage', () => {
  const runBootstrap = (stored: string | null, languages: readonly string[]): string => {
    const state = { lang: '' };
    const fakeDocument = { documentElement: state };
    const fakeStorage = { getItem: () => stored };
    const fakeNavigator = { languages, language: languages[0] };
    new Function('document', 'localStorage', 'navigator', INLINE_INTERFACE_LANGUAGE_BOOTSTRAP)(
      fakeDocument,
      fakeStorage,
      fakeNavigator,
    );
    return state.lang;
  };

  const cases: readonly { readonly stored: string | null; readonly languages: readonly string[] }[] = [
    { stored: null, languages: ['fr-FR'] },
    { stored: 'en', languages: ['fr-FR'] },
    { stored: 'sw', languages: ['de-DE', 'en'] },
    { stored: null, languages: ['ja-JP', 'pt-BR'] },
    { stored: null, languages: ['ja-JP'] },
    { stored: null, languages: [] },
    { stored: '', languages: ['AR-EG'] },
    { stored: 'it', languages: [] },
  ];

  for (const { stored, languages } of cases) {
    test(`stocké ${JSON.stringify(stored)}, navigateur ${JSON.stringify(languages)}`, () => {
      expect(resolveInterfaceLanguageCode(stored, languages)).toBe(runBootstrap(stored, languages));
    });
  }
});
