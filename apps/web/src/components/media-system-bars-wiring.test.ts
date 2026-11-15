import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * LES TROIS PLEINS ÉCRANS SOMBRES TIENNENT LA BARRE DE LA COQUE (#10917) :
 * la visionneuse, la story et l'appel sont `fixed inset-0` sur du noir. Chacun
 * appelle `useMediaSystemBars()` tant qu'il est monté.
 */
const source = (chemin: string): string => readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', chemin), 'utf8');

describe('les pleins écrans sombres tiennent la barre de la coque (#10917)', () => {
  for (const chemin of ['components/media-viewer.tsx', 'routes/story.tsx', 'components/call-screen.tsx']) {
    test(`${chemin} appelle useMediaSystemBars`, () => {
      const texte = source(chemin);
      expect(texte).toContain("from '@/lib/use-media-system-bars'");
      expect(texte).toMatch(/\buseMediaSystemBars\(\)/);
    });
  }
});
