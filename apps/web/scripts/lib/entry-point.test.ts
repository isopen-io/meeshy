import { mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { describe, expect, test } from 'bun:test';

import { isEntryPoint } from './entry-point.mjs';

/**
 * UN GATE IMPORTABLE NE DOIT PAS DEVENIR UN GATE MUET (#7869).
 *
 * Rendre un gate importable par son témoin impose de ne lancer son pilote que
 * lorsqu'il est EXÉCUTÉ. La garde du dépôt comparait `import.meta.url` à
 * `pathToFileURL(process.argv[1])` : node rend `import.meta.url` résolu de ses
 * liens symboliques, `process.argv[1]` non. Mesuré sur
 * `check-android-manifest.mjs` lancé par un chemin à lien symbolique, la
 * permission `ACCESS_NETWORK_STATE` retirée du manifeste : rc 0, AUCUNE
 * sortie — le gate ne s'exécutait pas et passait pour vert.
 */
const workspace = (): { readonly script: string; readonly linkedScript: string; readonly sibling: string } => {
  const root = mkdtempSync(join(tmpdir(), 'entry-point-'));
  const real = join(root, 'real');
  mkdirSync(real);
  const script = join(real, 'gate.mjs');
  const sibling = join(real, 'other.mjs');
  writeFileSync(script, '');
  writeFileSync(sibling, '');
  symlinkSync(real, join(root, 'linked'));
  return { script, linkedScript: join(root, 'linked', 'gate.mjs'), sibling };
};

describe('isEntryPoint — le pilote tourne quand le module est EXÉCUTÉ, jamais quand il est importé', () => {
  test('lancé par son propre chemin → vrai', () => {
    const { script } = workspace();
    expect(isEntryPoint({ moduleUrl: pathToFileURL(script).href, invokedPath: script })).toBe(true);
  });

  test('lancé par un chemin à lien symbolique → vrai, le gate ne devient pas muet', () => {
    const { script, linkedScript } = workspace();
    expect(isEntryPoint({ moduleUrl: pathToFileURL(script).href, invokedPath: linkedScript })).toBe(true);
  });

  test('importé par un autre fichier → faux', () => {
    const { script, sibling } = workspace();
    expect(isEntryPoint({ moduleUrl: pathToFileURL(script).href, invokedPath: sibling })).toBe(false);
  });

  test('aucun script invoqué (node -e, REPL) → faux', () => {
    const { script } = workspace();
    expect(isEntryPoint({ moduleUrl: pathToFileURL(script).href, invokedPath: undefined })).toBe(false);
  });

  test('un chemin invoqué qui n existe pas → faux, jamais une exception à l import', () => {
    const { script } = workspace();
    expect(
      isEntryPoint({ moduleUrl: pathToFileURL(script).href, invokedPath: join(tmpdir(), 'absent', 'gate.mjs') }),
    ).toBe(false);
  });
});
