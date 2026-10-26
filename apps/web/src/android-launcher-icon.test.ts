import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, test } from 'bun:test';

/**
 * L'ICÔNE DE LA COQUE ANDROID SUIT LES ICÔNES À THÈME (#13188).
 *
 * Android 13 teint d'une seule couleur l'icône de toute application qui
 * déclare un calque `monochrome` ; les autres restent en couleurs au milieu
 * d'un écran d'accueil teinté. L'app iOS livre sa variante teintée
 * (`AppIcon.appiconset`, `luminosity: tinted`) : la coque déclare la sienne,
 * le glyphe aux trois traits de `ic_stat_meeshy.xml`, porté à 108 dp. Le
 * système n'en lit que l'alpha, dans la zone sûre de 66 dp (21 à 87).
 */

const RES = join(dirname(fileURLToPath(import.meta.url)), '..', 'android', 'app', 'src', 'main', 'res');
const read = (path: string) => readFileSync(join(RES, path), 'utf8').replace(/<!--[\s\S]*?-->/g, '');

describe("l'icône adaptative de la coque (#13188)", () => {
  for (const icon of ['ic_launcher', 'ic_launcher_round']) {
    test(`${icon} déclare un calque monochrome`, () => {
      expect(read(`mipmap-anydpi-v26/${icon}.xml`)).toMatch(/<monochrome\s+android:drawable="@drawable\/ic_launcher_monochrome"\s*\/>/);
    });
  }

  test('le calque monochrome est un vecteur de 108 dp tenu dans la zone sûre', () => {
    const vector = read('drawable/ic_launcher_monochrome.xml');
    expect(vector).toContain('android:viewportWidth="108"');
    expect(vector).toContain('android:viewportHeight="108"');
    expect(vector).not.toContain('<gradient');
    const coordinates = [...vector.matchAll(/android:pathData="([^"]+)"/g)]
      .flatMap((match) => [...(match[1] ?? '').matchAll(/\d+(?:\.\d+)?/g)])
      .map((match) => Number(match[0]));
    expect(coordinates.length).toBeGreaterThan(0);
    expect(coordinates.every((value) => value >= 21 && value <= 87)).toBe(true);
  });
});
