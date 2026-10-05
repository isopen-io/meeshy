import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, test } from 'bun:test';

/**
 * « COLLER » UNE IMAGE EN STICKER FONCTIONNE DANS LA COQUE ANDROID (#8640).
 *
 * La WebView ne sert pas `navigator.clipboard.read()` : aucune permission
 * `clipboard-read` n'y est accordée, la lecture rejette et la feuille des
 * stickers disait « Aucune image dans le presse-papier » avec une image
 * copiée. La coque lit donc le presse-papier système elle-même
 * (`MeeshyClipboard.readImage`), et la feuille passe par ce pont quand la
 * coque le déclare.
 */

const APP = join(dirname(fileURLToPath(import.meta.url)), '..');
const JAVA = join(APP, 'android', 'app', 'src', 'main', 'java', 'me', 'meeshy', 'app');
const lire = (chemin: string) => readFileSync(chemin, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

describe('la coque Android colle une image en sticker (#8640)', () => {
  test('le pont est enregistré avant la construction du pont Capacitor', () => {
    const activite = lire(join(JAVA, 'MainActivity.java'));
    const enregistrement = activite.indexOf('registerPlugin(MeeshyClipboardPlugin.class)');
    expect(enregistrement).toBeGreaterThan(-1);
    expect(activite.indexOf('super.onCreate(savedInstanceState)')).toBeGreaterThan(enregistrement);
  });

  test('le plugin déclare MeeshyClipboard.readImage et lit le presse-papier système', () => {
    const plugin = lire(join(JAVA, 'MeeshyClipboardPlugin.java'));
    expect(plugin).toMatch(/@CapacitorPlugin\(\s*name\s*=\s*"MeeshyClipboard"\s*\)/);
    expect(plugin).toMatch(/@PluginMethod\s+public void readImage\(\s*PluginCall \w+\s*\)/);
    expect(plugin).toMatch(/getPrimaryClip\(\)/);
    expect(plugin).toMatch(/ClipboardImage\.readCapped\(/);
  });

  test('la feuille des stickers passe par ce pont quand la coque le déclare', () => {
    const feuille = lire(join(APP, 'src', 'components', 'composer-sticker-sheet.tsx'));
    expect(feuille).toMatch(/readClipboardImages\(\s*navigator\.clipboard\s*,\s*appelNatifMethode\(\s*coqueCourante\(\)\s*,\s*'MeeshyClipboard'\s*,\s*'readImage'\s*\)\s*\)/);
  });
});
