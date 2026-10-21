import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, test } from 'bun:test';

/**
 * CHOISIR UNE PHOTO OUVRE LE SÉLECTEUR DE PHOTOS DU SYSTÈME (#10087).
 *
 * Chrome Android ouvre la galerie du système pour `accept="image/*"` ou
 * `video/*` ; Capacitor lance `ACTION_GET_CONTENT`, l'explorateur de
 * fichiers. Le client de la WebView choisit `ACTION_PICK_IMAGES` quand
 * `PhotoPickRules` (JUnit) le dit, et rend tout le reste à Capacitor. Ce
 * témoin garde ce branchement.
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

describe('la coque ouvre le sélecteur de photos du système (#10087)', () => {
  const code = sansCommentaires(readFileSync(MAIN_ACTIVITY, 'utf8'));

  test('le client de la WebView choisit le sélecteur de photos selon la règle, et rend le reste à Capacitor', () => {
    const choix = corpsDe(code, 'public boolean onShowFileChooser(');
    expect(choix).toContain('PhotoPickRules.pickerType(Build.VERSION.SDK_INT,');
    expect(choix).toContain('isCaptureEnabled()');
    expect(choix).toContain('super.onShowFileChooser(');
    expect(choix).toContain('MediaStore.ACTION_PICK_IMAGES');
    expect(choix).toContain('MediaStore.EXTRA_PICK_IMAGES_MAX');
  });

  test('le lanceur est enregistré à la création et rend toujours la main à la page', () => {
    const creation = corpsDe(code, 'protected void onCreate(Bundle savedInstanceState)');
    expect(creation).toContain('registerForActivityResult(');
    expect(code).toMatch(/onReceiveValue\(/);
  });
});
