import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, test } from 'bun:test';

/**
 * APRÈS QU'ANDROID A FERMÉ LA COQUE, ON REVIENT SUR L'ÉCRAN OUVERT (#10034).
 *
 * Chrome recharge un onglet tué en arrière-plan à la MÊME adresse ; Capacitor
 * recharge toujours l'URL de départ. L'activité garde donc l'adresse in-app
 * de la WebView dans son état sauvegardé et, recréée, la rejoue par le chemin
 * des liens profonds (`MeeshyLinksPlugin` → `shell-deep-links.ts`). La règle
 * vit dans `ShellRoute` (JUnit), ce témoin garde son branchement.
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

describe('la coque retrouve l’écran ouvert quand Android la recrée (#10034)', () => {
  const code = sansCommentaires(readFileSync(MAIN_ACTIVITY, 'utf8'));

  test('l’état sauvegardé garde l’adresse in-app de la WebView', () => {
    const sauve = corpsDe(code, 'public void onSaveInstanceState(Bundle');
    expect(sauve).toContain('super.onSaveInstanceState(');
    expect(sauve).toContain('.getUrl()');
    expect(sauve).toContain('ShellRoute.restoreLink(');
    expect(sauve).toContain('putString(ShellRoute.KEY,');
  });

  test('recréée, l’activité rejoue l’adresse avant que Capacitor ne lise son intent', () => {
    const creation = corpsDe(code, 'protected void onCreate(Bundle savedInstanceState)');
    const rejoue = creation.indexOf('setIntent(new Intent(Intent.ACTION_VIEW');
    expect(rejoue).toBeGreaterThan(-1);
    expect(creation.indexOf('getString(ShellRoute.KEY)')).toBeGreaterThan(-1);
    expect(rejoue).toBeLessThan(creation.indexOf('super.onCreate(savedInstanceState)'));
  });
});
