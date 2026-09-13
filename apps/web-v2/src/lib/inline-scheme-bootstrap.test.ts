import { expect, test } from 'bun:test';

import { INLINE_SCHEME_BOOTSTRAP, SCHEME_KEY } from './inline-scheme-bootstrap.js';

/**
 * Ce témoin EXÉCUTE le texte du script — il ne compare aucune chaîne — pour
 * fermer exactement le défaut de #5587/#5588 : un renommage de `SCHEME_KEY`
 * ou de la valeur `'light'` que ce fichier oublierait de propager doit faire
 * tomber un des cas ci-dessous, pas seulement changer un texte que personne
 * ne relit.
 *
 * `document`, `localStorage` et `window` sont des variables LIBRES dans
 * `INLINE_SCHEME_BOOTSTRAP` (l'IIFE ne prend aucun paramètre — il tourne tel
 * quel, collé dans `<head>`). `new Function(...)` les redéclare comme
 * paramètres de la fonction fabriquée : elles font alors écran par closure,
 * sans toucher au `globalThis` réel du test runner.
 */
function classList(initial: ReadonlySet<string>) {
  const classes = new Set(initial);
  return {
    classes,
    toggle(name: string, force?: boolean) {
      const shouldHave = force === undefined ? !classes.has(name) : force;
      if (shouldHave) classes.add(name);
      else classes.delete(name);
      return shouldHave;
    },
  };
}

function run(options: { stored: string | null | 'DENIED'; prefersLight: boolean; initialClasses?: string[] }) {
  const html = classList(new Set(options.initialClasses ?? ['dark']));
  const fakeDocument = { documentElement: { classList: html } };
  const fakeLocalStorage = {
    getItem(key: string) {
      if (options.stored === 'DENIED') throw new Error('SecurityError: stockage refusé');
      expect(key).toBe(SCHEME_KEY);
      return options.stored;
    },
  };
  const fakeWindow = { matchMedia: (_query: string) => ({ matches: options.prefersLight }) };

  const bootstrap = new Function('document', 'localStorage', 'window', INLINE_SCHEME_BOOTSTRAP);
  bootstrap(fakeDocument, fakeLocalStorage, fakeWindow);
  return html.classes;
}

test('un schema clair stocke pose la classe light et retire dark', () => {
  const classes = run({ stored: 'light', prefersLight: false });
  expect(classes.has('light')).toBeTruthy();
  expect(classes.has('dark')).toBe(false);
});

test('un schema sombre stocke pose la classe dark et retire light', () => {
  const classes = run({ stored: 'dark', prefersLight: true });
  expect(classes.has('dark')).toBeTruthy();
  expect(classes.has('light')).toBe(false);
});

test('rien de stocke retombe sur prefers-color-scheme cote clair', () => {
  const classes = run({ stored: null, prefersLight: true });
  expect(classes.has('light')).toBeTruthy();
  expect(classes.has('dark')).toBe(false);
});

test('rien de stocke retombe sur prefers-color-scheme cote sombre', () => {
  const classes = run({ stored: null, prefersLight: false });
  expect(classes.has('dark')).toBeTruthy();
  expect(classes.has('light')).toBe(false);
});

test('un stockage refuse (mode prive) ne leve pas et laisse le schema du HTML', () => {
  const classes = run({ stored: 'DENIED', prefersLight: true, initialClasses: ['dark'] });
  // Le schema sombre pose par le HTML avant l'execution du script reste :
  // le `catch` du script ne touche a rien.
  expect(classes.has('dark')).toBeTruthy();
  expect(classes.has('light')).toBe(false);
});
