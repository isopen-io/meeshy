import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, test } from 'bun:test';

import { CAPTURE_SHIELD_PLUGIN } from '@/lib/capture/capture-shield';

/**
 * LE PONT DE CAPTURE DE LA COQUE ANDROID (#9574, #9617). La page appelle
 * `MeeshyScreenGuard.setSecure` / `getState` (`src/lib/capture/capture-shield.ts`)
 * et écoute `screenCaptured` / `recordingChanged`
 * (`src/lib/capture/screen-capture-reports.ts`). Ces noms ne se vérifient
 * nulle part ailleurs : un plugin renommé laisserait la vue unique fermée
 * (coque sans pont) et la capture muette. Les versions d'Android sont tenues
 * par `ScreenGuardRulesTest.java`.
 */

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const JAVA = join(ROOT, 'android', 'app', 'src', 'main', 'java', 'me', 'meeshy', 'app');
const sansCommentaires = (source: string): string => source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
const lire = (fichier: string): string => sansCommentaires(readFileSync(join(JAVA, fichier), 'utf8'));
const lireWeb = (chemin: string): string => readFileSync(join(ROOT, 'src', chemin), 'utf8');

describe('le pont de capture de la coque Android', () => {
  test('le plugin porte le nom que la page appelle, et ses deux méthodes', () => {
    const plugin = lire('MeeshyScreenGuardPlugin.java');
    expect(plugin).toContain(`name = "${CAPTURE_SHIELD_PLUGIN}"`);
    expect(plugin).toMatch(/@PluginMethod\s+public void setSecure\(/);
    expect(plugin).toMatch(/@PluginMethod\s+public void getState\(/);
    expect(plugin).toContain('FLAG_SECURE');
  });

  test('les événements émis sont ceux que la page écoute', () => {
    const plugin = lire('MeeshyScreenGuardPlugin.java');
    const reports = lireWeb('lib/capture/screen-capture-reports.ts');
    for (const evenement of ['screenCaptured', 'recordingChanged']) {
      expect(plugin).toContain(`notifyListeners("${evenement}"`);
      expect(reports).toContain(`'${evenement}'`);
    }
  });

  test('chaque API est gardée par sa version, et le drapeau tombe quand le document recharge', () => {
    const plugin = lire('MeeshyScreenGuardPlugin.java');
    expect(plugin).toContain('Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE');
    expect(plugin).toContain('Build.VERSION.SDK_INT >= Build.VERSION_CODES.VANILLA_ICE_CREAM');
    expect(plugin).toContain('registerScreenCaptureCallback');
    expect(plugin).toContain('unregisterScreenCaptureCallback');
    expect(plugin).toContain('addScreenRecordingCallback');
    expect(plugin).toContain('removeScreenRecordingCallback');
    expect(plugin).toMatch(/onPageStarted\(WebView webView\)\s*\{\s*applySecure\(false\);/);
    expect(plugin).toContain('state.put("screenshotDetection", screenshotWatch != null);');
    expect(plugin).toContain('state.put("recordingDetection", recordingWatch != null);');
  });

  test('la coque l’enregistre avant de construire le pont', () => {
    const activite = lire('MainActivity.java');
    const enregistrement = activite.indexOf('registerPlugin(MeeshyScreenGuardPlugin.class);');
    expect(enregistrement).toBeGreaterThan(-1);
    expect(enregistrement).toBeLessThan(activite.indexOf('super.onCreate(savedInstanceState);'));
  });

  test('le masque de la vue unique hors coque a sa règle', () => {
    const feuille = lireWeb('styles/thread-protection.css');
    expect(feuille).toMatch(/:root\[data-view-once-away\] \[data-view-once-open\]/);
    expect(feuille).toMatch(/:root\[data-view-once-away\] \[data-media-viewer\]/);
  });
});
