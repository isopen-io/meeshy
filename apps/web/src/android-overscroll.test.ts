import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, test } from 'bun:test';

/**
 * TIRER AU BOUT D'UNE PAGE N'ÉTIRE PAS LA COQUE (#10250).
 *
 * `html { overscroll-behavior-y: none }` (`styles/app.css`) coupe l'effet de
 * bord sur Chrome Android. La WebView dessine le sien elle-même et n'écoute
 * que `View.setOverScrollMode` : sans lui, toute l'interface s'étire au bout
 * d'une page, barres fixes comprises. Ce témoin garde le réglage, posé dès la
 * création de l'activité.
 */

const MAIN_ACTIVITY = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'android',
  'app',
  'src',
  'main',
  'java',
  'me',
  'meeshy',
  'app',
  'MainActivity.java',
);

function sansCommentaires(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
}

function corpsDe(code: string, signature: string): string {
  const debut = code.indexOf(signature);
  expect(debut).toBeGreaterThan(-1);
  const ouverture = code.indexOf('{', debut);
  let profondeur = 0;
  for (let i = ouverture; i < code.length; i += 1) {
    if (code[i] === '{') profondeur += 1;
    if (code[i] === '}') profondeur -= 1;
    if (profondeur === 0) return code.slice(ouverture, i + 1);
  }
  return code.slice(ouverture);
}

describe('la coque ne s’étire pas au bout d’une page (#10250)', () => {
  const code = sansCommentaires(readFileSync(MAIN_ACTIVITY, 'utf8'));
  const css = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'styles', 'app.css'), 'utf8');

  test('la page demande de couper le rebond', () => {
    expect(css).toMatch(/overscroll-behavior-y:\s*none/);
  });

  test('la WebView de la coque coupe son effet de bord dès la création', () => {
    const creation = corpsDe(code, 'protected void onCreate(Bundle savedInstanceState)');
    expect(creation).toMatch(/getBridge\(\)\.getWebView\(\)\.setOverScrollMode\(View\.OVER_SCROLL_NEVER\)/);
  });
});
