import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, test } from 'bun:test';

/**
 * LE RETOUR SYSTÈME DE LA COQUE ANDROID SUIT L'HISTORIQUE (#7988, #10585).
 *
 * `MainActivity` intercepte le retour système : la WebView remonte son
 * historique, et seulement quand elle n'en a plus, le système rend la main au
 * lanceur (#5604). Depuis Android 12, ce retour ne détruit plus l'activité :
 * rouverte, elle doit encore remonter l'historique, sinon le retour fermerait
 * l'app depuis n'importe quel écran (#7988).
 *
 * Sur Android 16 (API cible 36), le système n'anime le retour à l'accueil que
 * si AUCUN callback n'est actif : le callback n'est donc actif que lorsque la
 * coque a quelque chose à reculer — plein écran ou historique — et se
 * resynchronise à chaque entrée d'historique et à chaque plein écran (#10585).
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

describe('le retour système de la coque Android (#7988, #10585)', () => {
  const code = sansCommentaires(readFileSync(MAIN_ACTIVITY, 'utf8'));

  test("le callback naît inactif : la racine appartient au système jusqu'à la première entrée d'historique", () => {
    expect(code).toContain('new OnBackPressedCallback(false)');
    expect(code).not.toContain('new OnBackPressedCallback(true)');
  });

  test("son état se lit dans le plein écran et l'historique de la WebView", () => {
    const sync = corpsDe(code, 'private void syncBack(');
    expect(sync).toMatch(/BackRules\.interceptsBack\(\s*fullscreenView != null,[^)]*canGoBack\(\)/);
    expect(sync).toContain('.setEnabled(');
  });

  test("chaque entrée d'historique le resynchronise, pushState et fermeture de panneau compris", () => {
    expect(code).toMatch(/getBridge\(\)\s*\.setWebViewClient\(\s*new BridgeWebViewClient\(/);
    expect(corpsDe(code, 'public void doUpdateVisitedHistory(')).toContain('syncBack()');
  });

  test('entrer et sortir du plein écran le resynchronise', () => {
    expect(corpsDe(code, 'public void onShowCustomView(')).toContain('syncBack()');
    expect(corpsDe(code, 'public void onHideCustomView(')).toContain('syncBack()');
  });

  test("le retour par défaut ne le réactive pas à la racine : c'est l'historique qui le fera, à la réouverture comme avant", () => {
    const retour = corpsDe(code, 'public void handleOnBackPressed(');
    expect(retour).toContain('getOnBackPressedDispatcher().onBackPressed()');
    expect(retour).not.toContain('setEnabled(true)');
  });
});
