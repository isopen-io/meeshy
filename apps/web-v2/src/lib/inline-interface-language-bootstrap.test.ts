import { expect, test } from 'bun:test';

import {
  DEFAULT_INTERFACE_LANGUAGE,
  INLINE_INTERFACE_LANGUAGE_BOOTSTRAP,
  INTERFACE_LANGUAGE_KEY,
} from './inline-interface-language-bootstrap.js';

/**
 * Même patron que `inline-scheme-bootstrap.test.ts` (#5588) : ce témoin
 * EXÉCUTE le texte du script plutôt que de comparer des chaînes, pour qu'un
 * renommage de `INTERFACE_LANGUAGE_KEY` ou de la liste des langues supportées
 * que ce fichier oublierait de propager fasse tomber un cas ci-dessous.
 *
 * `document`, `localStorage` et `navigator` sont des variables LIBRES dans
 * `INLINE_INTERFACE_LANGUAGE_BOOTSTRAP` — `new Function(...)` les redéclare
 * en paramètres, sans toucher au `globalThis` réel du test runner.
 */
function run(options: {
  readonly stored: string | null | 'DENIED';
  readonly navigatorLanguages: readonly string[];
}) {
  let lang = '';
  const fakeDocument = {
    documentElement: {
      set lang(value: string) {
        lang = value;
      },
      get lang() {
        return lang;
      },
    },
  };
  const fakeLocalStorage = {
    getItem(key: string) {
      if (options.stored === 'DENIED') throw new Error('SecurityError: stockage refusé');
      expect(key).toBe(INTERFACE_LANGUAGE_KEY);
      return options.stored;
    },
  };
  const fakeNavigator = { languages: options.navigatorLanguages, language: options.navigatorLanguages[0] };

  const bootstrap = new Function('document', 'localStorage', 'navigator', INLINE_INTERFACE_LANGUAGE_BOOTSTRAP);
  bootstrap(fakeDocument, fakeLocalStorage, fakeNavigator);
  return lang;
}

test('un choix stocké et cataloguée l’emporte sur navigator.languages', () => {
  expect(run({ stored: 'en', navigatorLanguages: ['fr-FR', 'fr'] })).toBe('en');
});

test('un choix stocké non catalogué est ignoré au profit de navigator.languages', () => {
  expect(run({ stored: 'de', navigatorLanguages: ['en-US', 'en'] })).toBe('en');
});

test('rien de stocké : la première langue de navigator.languages qui est cataloguée gagne', () => {
  expect(run({ stored: null, navigatorLanguages: ['de-DE', 'en-GB', 'fr-FR'] })).toBe('en');
});

test('rien de stocké, aucune langue de navigator.languages cataloguée : repli sur le défaut', () => {
  expect(run({ stored: null, navigatorLanguages: ['de-DE', 'es-ES'] })).toBe(DEFAULT_INTERFACE_LANGUAGE);
});

test('un stockage refusé (mode privé) ne lève pas — même patron que le schéma : le `catch` unique enveloppe tout le bloc, donc il laisse la valeur statique du HTML plutôt que de retomber sur navigator.languages', () => {
  expect(run({ stored: 'DENIED', navigatorLanguages: ['en-US'] })).toBe('');
});
