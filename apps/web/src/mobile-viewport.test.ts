import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, test } from 'bun:test';

import { resolveCapacitorConfig } from '../capacitor.config';

/**
 * LES ÉCRANS D'APPLICATION TIENNENT AU-DESSUS DU CLAVIER, SUR LES TROIS
 * NAVIGATEURS MOBILES (#10005).
 *
 * `installKeyboardViewport` (`lib/view/keyboard-viewport.ts`) pose la hauteur
 * du clavier sur `<html>` ; ce témoin garde ceux qui la LISENT. Une racine
 * d'écran d'application se dit `h-app` — `100dvh` moins ce que le clavier
 * recouvre — et non plus `h-dvh`, qui garde sa hauteur sous un clavier
 * d'iPhone : le composeur du fil, la recherche de la liste et le champ du nom
 * de l'entrée invité restent au-dessus du clavier, l'en-tête reste en place.
 */

const APP = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path: string) => readFileSync(join(APP, path), 'utf8');

describe('la hauteur d’un écran d’application (#10005)', () => {
  const css = read('src/styles/app.css');

  test('`h-app` retire de 100dvh ce que le clavier recouvre', () => {
    const utility = css.match(/@utility h-app \{([^}]*)\}/)?.[1] ?? '';
    expect(utility).toContain('height: calc(100dvh - var(--keyboard-inset, 0px))');
  });

  test('clavier ouvert, l’indicateur home n’écarte plus le composeur du clavier', () => {
    expect(css).toMatch(/:root\[data-keyboard='open'\]\s*\{\s*--safe-bottom:\s*0px;\s*\}/);
  });

  const screens = [
    ['le fil', 'src/routes/thread.tsx'],
    ['ses états (chargement, erreur)', 'src/components/thread-states.tsx'],
    ['la liste /chats', 'src/routes/conversations.tsx'],
    ['l’entrée invité dans World Wide', 'src/routes/world-entry.tsx'],
  ] as const;
  screens.forEach(([screen, path]) => {
    test(`${screen} se dimensionne en h-app, jamais en h-dvh`, () => {
      const source = read(path);
      expect(source).toContain('h-app');
      expect(source).not.toMatch(/['"\s]h-dvh['"\s]/);
    });
  });

  test('le clavier est écouté dès le démarrage, hors de la première peinture', () => {
    expect(read('src/main.tsx')).toMatch(/import\('@\/lib\/view\/keyboard-viewport'\)\.then\(\(\{ installKeyboardViewport \}\) => installKeyboardViewport\(window\)\)/);
  });
});

describe('la coque Android, bord à bord (#10005)', () => {
  test('SystemBars sait dès le lancement que la page couvre l’écran : aucun saut de mise en page', () => {
    expect(resolveCapacitorConfig({}).plugins?.SystemBars).toEqual({ insetsHandling: 'css', initialViewportFitValueHint: 'cover' });
  });
});
