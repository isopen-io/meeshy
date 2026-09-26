import { expect, test } from 'bun:test';

import { INLINE_APP_SCHEME_BOOTSTRAP, INLINE_SCHEME_BOOTSTRAP, SCHEME_KEY } from './inline-scheme-bootstrap.js';

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

function themeColorMeta(scheme: 'light' | 'dark') {
  return {
    media: `(prefers-color-scheme: ${scheme})`,
    getAttribute: (name: string) => (name === 'data-scheme' ? scheme : null),
  };
}

function run(options: {
  stored: string | null | 'DENIED';
  prefersLight: boolean;
  initialClasses?: string[];
  script?: string;
}) {
  const html = classList(new Set(options.initialClasses ?? ['dark']));
  const metas = [themeColorMeta('dark'), themeColorMeta('light')];
  const fakeDocument = {
    documentElement: { classList: html },
    querySelectorAll: (selector: string) => (selector === 'meta[name="theme-color"][data-scheme]' ? metas : []),
  };
  const fakeLocalStorage = {
    getItem(key: string) {
      if (options.stored === 'DENIED') throw new Error('SecurityError: stockage refusé');
      expect(key).toBe(SCHEME_KEY);
      return options.stored;
    },
  };
  const fakeWindow = { matchMedia: (_query: string) => ({ matches: options.prefersLight }) };

  const bootstrap = new Function('document', 'localStorage', 'window', options.script ?? INLINE_APP_SCHEME_BOOTSTRAP);
  bootstrap(fakeDocument, fakeLocalStorage, fakeWindow);
  return Object.assign(html.classes, {
    barre: Object.fromEntries(metas.map((meta) => [meta.getAttribute('data-scheme'), meta.media])),
  });
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

/**
 * LA BARRE DU NAVIGATEUR DÈS LA PREMIÈRE IMAGE (#7970). Sans ce réglage, la
 * meta `theme-color` suit le SYSTÈME jusqu'à ce que `main.tsx` arrive
 * (`syncBrowserBar`, scheme.ts) : un thème clair choisi sur un téléphone
 * sombre se peint sous une barre sombre pendant tout le téléchargement.
 */
test('un schema clair choisi sur un systeme sombre allume la barre claire des la premiere image', () => {
  const { barre } = run({ stored: 'light', prefersLight: false });
  expect(barre).toEqual({ light: 'all', dark: 'not all' });
});

test('le script des pages institutionnelles peint le meme schema sans toucher a leurs metas', () => {
  const peint = run({ stored: 'light', prefersLight: false, script: INLINE_SCHEME_BOOTSTRAP });
  expect(peint.has('light')).toBeTruthy();
  expect(peint.barre).toEqual({ light: '(prefers-color-scheme: light)', dark: '(prefers-color-scheme: dark)' });
});

test('un schema sombre choisi sur un systeme clair allume la barre sombre des la premiere image', () => {
  const { barre } = run({ stored: 'dark', prefersLight: true });
  expect(barre).toEqual({ light: 'not all', dark: 'all' });
});
