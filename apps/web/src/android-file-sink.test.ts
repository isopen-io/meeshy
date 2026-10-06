import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, test } from 'bun:test';

/**
 * LA COQUE ANDROID REÇOIT UN GROS FICHIER PAR TRANCHES (#9514) — le récepteur
 * que `shellGallerySaver` appelle (`src/lib/gallery/gallery-saver.ts`) pour une
 * vidéo plus lourde que le pont. Les bornes (extension, taille) sont tenues par
 * `FileSinkRulesTest.java`.
 */

const JAVA = join(dirname(fileURLToPath(import.meta.url)), '..', 'android', 'app', 'src', 'main', 'java', 'me', 'meeshy', 'app');
const lire = (fichier: string): string =>
  readFileSync(join(JAVA, fichier), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

describe('le récepteur de fichiers de la coque Android (#9514)', () => {
  test('le plugin porte le nom que la page appelle, et ses quatre méthodes', () => {
    const plugin = lire('MeeshyFileSinkPlugin.java');
    expect(plugin).toContain('name = "MeeshyFileSink"');
    for (const methode of ['open', 'append', 'close', 'discard']) expect(plugin).toMatch(new RegExp(`@PluginMethod\\s+public void ${methode}\\(`));
    expect(plugin).toContain('FileSinkRules.extensionAllowed(');
    expect(plugin).toContain('FileSinkRules.fits(');
    expect(plugin).toContain('getCacheDir()');
  });

  test('la coque l’enregistre avant de construire le pont', () => {
    const activite = lire('MainActivity.java');
    const enregistrement = activite.indexOf('registerPlugin(MeeshyFileSinkPlugin.class);');
    expect(enregistrement).toBeGreaterThan(-1);
    expect(enregistrement).toBeLessThan(activite.indexOf('super.onCreate(savedInstanceState);'));
  });
});
