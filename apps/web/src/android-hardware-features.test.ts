import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, test } from 'bun:test';

/**
 * GOOGLE PLAY NE MASQUE PAS LA COQUE AUX APPAREILS QUE CHROME SERT (#10515).
 *
 * Play déduit le matériel REQUIS des permissions demandées, sauf déclaration
 * contraire : `CAMERA` exige aussi l'autofocus, `RECORD_AUDIO` le micro, et
 * toute application l'écran tactile. Chrome Android sert Meeshy sur une
 * tablette sans tactile, un Chromebook au clavier ou un téléphone à mise au
 * point fixe ; la coque doit y être installable, ses vocaux et ses appels
 * échouant proprement sans le matériel, comme dans le navigateur.
 */

const APP = join(dirname(fileURLToPath(import.meta.url)), '..');
const manifeste = readFileSync(join(APP, 'android', 'app', 'src', 'main', 'AndroidManifest.xml'), 'utf8').replace(/<!--[\s\S]*?-->/g, '');

const facultatives = new Set(
  [...manifeste.matchAll(/<uses-feature\s+android:name="([^"]+)"\s+android:required="false"\s*\/>/g)].map((m) => m[1] ?? ''),
);

describe('le matériel que la coque Android n’exige pas (#10515)', () => {
  for (const materiel of ['android.hardware.camera', 'android.hardware.camera.autofocus', 'android.hardware.microphone', 'android.hardware.touchscreen']) {
    test(`${materiel} est facultatif`, () => {
      expect(facultatives.has(materiel)).toBe(true);
    });
  }

  test('aucun matériel n’est déclaré requis', () => {
    expect(manifeste).not.toMatch(/<uses-feature(?![^>]*android:required="false")[^>]*>/);
  });
});
