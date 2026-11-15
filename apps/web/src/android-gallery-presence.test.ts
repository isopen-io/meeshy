import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, test } from 'bun:test';

/**
 * LA COQUE ANDROID DIT SI UN MÉDIA ENREGISTRÉ EST TOUJOURS DANS LA GALERIE
 * (#14654) — la question que `shellGallerySaver` pose avant de refuser un
 * réenregistrement (`src/lib/gallery/gallery-saver.ts`). La borne (l'album,
 * jamais un autre chemin) est tenue par `GalleryPresenceRulesTest.java`.
 */

const JAVA = join(dirname(fileURLToPath(import.meta.url)), '..', 'android', 'app', 'src', 'main', 'java', 'me', 'meeshy', 'app');
const lire = (fichier: string): string =>
  readFileSync(join(JAVA, fichier), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

describe('la vérification de présence de la coque Android (#14654)', () => {
  test('le plugin porte le nom que la page appelle et sa méthode `exists`, bornée au dossier des albums', () => {
    const plugin = lire('MeeshyGalleryPlugin.java');
    expect(plugin).toContain('name = "MeeshyGallery"');
    expect(plugin).toMatch(/@PluginMethod\s+public void exists\(/);
    expect(plugin).toContain('GalleryPresenceRules.insideAlbums(');
    expect(plugin).toContain('getExternalMediaDirs()');
    expect(plugin).toContain('result.put("exists"');
  });

  test('la coque l’enregistre avant de construire le pont', () => {
    const activite = lire('MainActivity.java');
    const enregistrement = activite.indexOf('registerPlugin(MeeshyGalleryPlugin.class);');
    expect(enregistrement).toBeGreaterThan(-1);
    expect(enregistrement).toBeLessThan(activite.indexOf('super.onCreate(savedInstanceState);'));
  });
});
