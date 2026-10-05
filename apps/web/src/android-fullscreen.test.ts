import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, test } from 'bun:test';

/**
 * LE PLEIN ÉCRAN S'OUVRE VRAIMENT DANS LA COQUE ANDROID (#8594).
 *
 * Sur le web, `requestFullscreen()` et le bouton plein écran d'un `<video>`
 * agrandissent l'élément. La WebView délègue ce geste à
 * `WebChromeClient.onShowCustomView`, que `BridgeWebChromeClient`
 * (Capacitor 8.5.1) referme aussitôt (`callback.onCustomViewHidden()`) sans
 * jamais attacher la vue : le plein écran d'un écran partagé en appel ne
 * faisait rien. La coque attache la vue au décor, la retire à la sortie, et le
 * retour matériel quitte le plein écran avant de remonter l'historique.
 */

const APP = join(dirname(fileURLToPath(import.meta.url)), '..');
const MAIN_ACTIVITY = join(APP, 'android', 'app', 'src', 'main', 'java', 'me', 'meeshy', 'app', 'MainActivity.java');

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

describe('le plein écran de la coque Android (#8594)', () => {
  const code = sansCommentaires(readFileSync(MAIN_ACTIVITY, 'utf8'));

  test("la vue plein écran est attachée au décor, sans la version de Capacitor qui la referme", () => {
    const montre = corpsDe(code, 'public void onShowCustomView(');
    expect(montre).not.toContain('super.onShowCustomView');
    expect(montre).toMatch(/getDecorView\(\)/);
    expect(montre).toMatch(/\.addView\(/);
  });

  test('la sortie retire la vue et rend la main à la WebView', () => {
    const cache = corpsDe(code, 'public void onHideCustomView(');
    expect(cache).toMatch(/\.removeView\(/);
    expect(cache).toMatch(/onCustomViewHidden\(\)/);
  });

  test("le retour matériel quitte le plein écran avant l'historique", () => {
    const retour = corpsDe(code, 'public void handleOnBackPressed(');
    const sortie = retour.search(/onHideCustomView\(\)/);
    expect(sortie).toBeGreaterThan(-1);
    expect(sortie).toBeLessThan(retour.indexOf('goBack()'));
  });
});
