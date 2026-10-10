import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, test } from 'bun:test';

/**
 * LA BOÎTE DE RÉCEPTION DE LA COQUE EST BRANCHÉE AU DÉMARRAGE (#8884).
 *
 * Un pont natif que personne n'écoute est un partage perdu : l'intent arrive,
 * la coque le copie, et rien ne l'ouvre. Le démarrage doit l'appeler — derrière
 * `__SHELL__` (le navigateur n'a pas de pont) et en `import()` (hors de la
 * première peinture), comme les liens profonds et le push de la coque.
 */
const SRC = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const main = readFileSync(join(SRC, 'main.tsx'), 'utf8');

describe('main.tsx démarre la boîte de réception de la coque', () => {
  test('derrière __SHELL__, en import() différé', () => {
    expect(main).toMatch(/if \(__SHELL__\) \{\s*void import\('@\/lib\/share-incoming\/native-start'\)\.then\(\(\{ startNativeShareInboxInShell \}\) => startNativeShareInboxInShell\(\)\);\s*\}/);
  });

  test('et n’importe jamais le module en statique', () => {
    expect(main).not.toMatch(/^import .* from '@\/lib\/share-incoming/m);
  });
});
