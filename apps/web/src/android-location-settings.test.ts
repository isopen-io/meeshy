import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, test } from 'bun:test';

/**
 * PARTAGER SA POSITION, LOCALISATION ÉTEINTE, PROPOSE DE L'ALLUMER (#10227).
 *
 * Chrome Android propose d'activer la localisation de l'appareil quand une
 * page la demande alors qu'elle est éteinte. Capacitor accorde la permission
 * sans regarder : la WebView rend `POSITION_UNAVAILABLE`, et « Réessayer »
 * échoue sans fin. Le client de la WebView enveloppe donc la réponse de
 * Capacitor, et ouvre les réglages de localisation quand `LocationPromptRules`
 * (JUnit) le dit. Ce témoin garde ce branchement.
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

describe('la coque propose d’allumer la localisation éteinte (#10227)', () => {
  const code = sansCommentaires(readFileSync(MAIN_ACTIVITY, 'utf8'));

  test('la réponse de Capacitor passe d’abord à la page, puis la règle décide', () => {
    const invite = corpsDe(code, 'public void onGeolocationPermissionsShowPrompt(');
    expect(invite).toContain('super.onGeolocationPermissionsShowPrompt(origin,');
    expect(invite).toContain('callback.invoke(');
    expect(invite).toContain('LocationPromptRules.opensLocationSettings(');
    expect(invite).toContain('locationEnabled()');
    expect(corpsDe(code, 'private boolean locationEnabled(')).toContain('LocationManagerCompat.isLocationEnabled(');
  });

  test('les réglages de localisation s’ouvrent, sans jamais faire tomber la coque', () => {
    const ouvrir = corpsDe(code, 'private void openLocationSettings(');
    expect(ouvrir).toContain('Settings.ACTION_LOCATION_SOURCE_SETTINGS');
    expect(ouvrir).toMatch(/catch \(android\.content\.ActivityNotFoundException/);
  });
});
