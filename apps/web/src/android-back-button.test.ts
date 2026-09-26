import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, test } from 'bun:test';

/**
 * LE RETOUR SUIT L'HISTORIQUE À CHAQUE RÉOUVERTURE DE LA COQUE ANDROID (#7988).
 *
 * `MainActivity` intercepte le retour système : la WebView remonte son
 * historique, et seulement quand elle n'en a plus, le callback se retire pour
 * laisser le système rendre la main au lanceur (#5604). Depuis Android 12, ce
 * retour ne détruit plus l'activité : rouverte, elle garde son callback. S'il
 * reste retiré, le retour ferme l'app depuis n'importe quel écran, là où le
 * web remonte toujours l'historique.
 */

const APP = join(dirname(fileURLToPath(import.meta.url)), '..');
const MAIN_ACTIVITY = join(APP, 'android', 'app', 'src', 'main', 'java', 'me', 'meeshy', 'app', 'MainActivity.java');

function sansCommentaires(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
}

describe('le retour système de la coque Android (#7988)', () => {
  test('le callback se réactive une fois le retour par défaut passé', () => {
    const code = sansCommentaires(readFileSync(MAIN_ACTIVITY, 'utf8'));
    const passe = code.indexOf('getOnBackPressedDispatcher().onBackPressed()');
    expect(passe).toBeGreaterThan(-1);
    expect(code.indexOf('setEnabled(false)')).toBeLessThan(passe);
    expect(code.indexOf('setEnabled(true)', passe)).toBeGreaterThan(passe);
  });
});
