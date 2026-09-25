import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, test } from 'bun:test';

/**
 * LA TUILE « APPAREIL PHOTO » OUVRE L'APPAREIL PHOTO DANS LA COQUE ANDROID (#7930).
 *
 * Le composeur demande la capture par `<input accept="image/*" capture>`. Chrome
 * Android ouvre alors l'appareil photo. La coque, elle, passe par
 * `BridgeWebChromeClient.showImageCapturePicker` (`@capacitor/android` 8.5.1),
 * qui ne lance l'intention `IMAGE_CAPTURE` que si `resolveActivity` trouve une
 * application pour la servir. Depuis l'API 30, la visibilité des paquets cache
 * toute application photo à une app qui ne déclare pas cette intention dans
 * `<queries>` : le pont retombe alors en silence sur le sélecteur de fichiers.
 */

const APP = join(dirname(fileURLToPath(import.meta.url)), '..');
const lire = (...chemin: string[]) => readFileSync(join(APP, ...chemin), 'utf8');

function intentionsInterrogees(manifeste: string): readonly string[] {
  const effectif = manifeste.replace(/<!--[\s\S]*?-->/g, '');
  const requetes = [...effectif.matchAll(/<queries>([\s\S]*?)<\/queries>/g)].map((bloc) => bloc[1] ?? '').join('');
  return [...requetes.matchAll(/<action\s+android:name="([^"]+)"/g)].map((action) => action[1] ?? '');
}

describe('la capture photo de la coque Android (#7930)', () => {
  test('le composeur demande bien la capture à l’appareil photo', () => {
    expect(lire('src', 'components', 'composer-attachment-panel.tsx')).toContain('capture="environment"');
  });

  test('le manifeste rend les applications photo visibles au pont', () => {
    const manifeste = lire('android', 'app', 'src', 'main', 'AndroidManifest.xml');
    expect(intentionsInterrogees(manifeste)).toContain('android.media.action.IMAGE_CAPTURE');
  });
});
