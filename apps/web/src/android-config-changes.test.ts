import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, test } from 'bun:test';

/**
 * CHANGER LA TAILLE DU TEXTE D'ANDROID NE REDÉMARRE PLUS LA COQUE (#8616).
 *
 * Un changement de configuration que l'activité ne déclare pas la RECRÉE :
 * Capacitor détruit alors la WebView (`Bridge.onDestroy`) et recharge l'URL de
 * départ — brouillon, fil ouvert et appel en cours perdus. Sur le web, Chrome
 * remet la page en page et suit la taille de police du système. La coque
 * déclare donc la taille, la graisse et le sens du texte, et règle elle-même
 * le zoom de texte de la WebView sur l'échelle du système.
 */

const APP = join(dirname(fileURLToPath(import.meta.url)), '..');
const MAIN = join(APP, 'android', 'app', 'src', 'main');
const MANIFEST = join(MAIN, 'AndroidManifest.xml');
const MAIN_ACTIVITY = join(MAIN, 'java', 'me', 'meeshy', 'app', 'MainActivity.java');

function sansCommentaires(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
}

function corpsDe(code: string, signature: RegExp): string {
  const debut = code.search(signature);
  if (debut < 0) return '';
  const ouverture = code.indexOf('{', debut);
  let profondeur = 0;
  for (let i = ouverture; i < code.length; i += 1) {
    if (code[i] === '{') profondeur += 1;
    if (code[i] === '}') profondeur -= 1;
    if (profondeur === 0) return code.slice(ouverture, i + 1);
  }
  return '';
}

function changementsDeclares(): readonly string[] {
  const manifeste = readFileSync(MANIFEST, 'utf8');
  const activite = manifeste.match(/<activity\b[^>]*android:name="\.MainActivity"[^>]*>/)?.[0] ?? '';
  return (activite.match(/android:configChanges="([^"]*)"/)?.[1] ?? '').split('|');
}

describe('la coque Android suit la taille du texte sans redémarrer (#8616)', () => {
  const code = sansCommentaires(readFileSync(MAIN_ACTIVITY, 'utf8'));

  ['fontScale', 'fontWeightAdjustment', 'layoutDirection'].forEach((changement) => {
    test(`l'activité déclare le changement ${changement} au lieu d'être recréée`, () => {
      expect(changementsDeclares()).toContain(changement);
    });
  });

  test('un changement de configuration règle le zoom de texte sur la nouvelle échelle', () => {
    const corps = corpsDe(code, /public void onConfigurationChanged\(\s*Configuration \w+\s*\)/);
    expect(corps).toMatch(/super\.onConfigurationChanged\(/);
    expect(corps).toMatch(/suivreTailleDuTexte\(\s*\w+\s*\)/);
  });

  test("le zoom de texte vaut l'échelle de police du système, en pourcent", () => {
    const corps = corpsDe(code, /private void suivreTailleDuTexte\(\s*Configuration \w+\s*\)/);
    expect(corps).toMatch(/setTextZoom\(\s*Math\.round\(\s*\w+\.fontScale\s*\*\s*100\s*\)\s*\)/);
  });

  test('le zoom de texte est posé dès la construction du pont', () => {
    const pont = code.indexOf('super.onCreate(savedInstanceState)');
    expect(pont).toBeGreaterThan(-1);
    expect(code.indexOf('suivreTailleDuTexte(getResources().getConfiguration())', pont)).toBeGreaterThan(pont);
  });
});
