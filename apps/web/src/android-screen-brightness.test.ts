import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, test } from 'bun:test';

/**
 * LE FLASH DU SELFIE POUSSE LA LUMINOSITÉ AU MAXIMUM DANS LA COQUE ANDROID
 * (#9531), comme `ComposerCameraFlash` sur iPhone. La page appelle
 * `ScreenBrightness.setBrightness` / `getBrightness`
 * (`src/lib/stories/studio-camera-engine.ts`, `maxBrightness`) ; la coque ne
 * déclarait aucun plugin de ce nom, et l'écran blanc éclairait à la luminosité
 * courante. Le bornage est tenu par `ScreenBrightnessRulesTest.java`.
 */

const JAVA = join(dirname(fileURLToPath(import.meta.url)), '..', 'android', 'app', 'src', 'main', 'java', 'me', 'meeshy', 'app');
const lire = (fichier: string): string =>
  readFileSync(join(JAVA, fichier), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

describe('la luminosité de la coque Android (#9531)', () => {
  test('le plugin porte le nom que la page appelle, et ses deux méthodes', () => {
    const plugin = lire('ScreenBrightnessPlugin.java');
    expect(plugin).toContain('name = "ScreenBrightness"');
    expect(plugin).toMatch(/@PluginMethod\s+public void getBrightness\(/);
    expect(plugin).toMatch(/@PluginMethod\s+public void setBrightness\(/);
    expect(plugin).toContain('screenBrightness');
    expect(plugin).toContain('ScreenBrightnessRules.window(');
  });

  test('la coque l’enregistre avant de construire le pont', () => {
    const activite = lire('MainActivity.java');
    const enregistrement = activite.indexOf('registerPlugin(ScreenBrightnessPlugin.class);');
    expect(enregistrement).toBeGreaterThan(-1);
    expect(enregistrement).toBeLessThan(activite.indexOf('super.onCreate(savedInstanceState);'));
  });
});
