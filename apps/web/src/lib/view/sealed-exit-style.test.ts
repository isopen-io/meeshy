import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, test } from 'bun:test';

/**
 * LE SCEAU EN CSS (#9573) — ce qu'aucun écouteur ne voit : l'appui long du
 * mobile et de la coque (`-webkit-touch-callout`), la sélection, l'impression.
 * La règle vit dans une feuille chargée AVEC l'application, pas avec le fil.
 */
const here = dirname(fileURLToPath(import.meta.url));
const css = readFileSync(join(here, '../../styles/sealed-exit.css'), 'utf8');
const block = (selector: string): string => {
  const at = css.indexOf(`${selector} {`);
  return at === -1 ? '' : css.slice(at, css.indexOf('}', at));
};

describe('styles/sealed-exit.css', () => {
  test('une surface scellée ne se sélectionne pas et n’ouvre pas le menu d’appui long, descendants compris', () => {
    const rule = block('[data-exit-sealed],\n[data-exit-sealed] *');
    expect(rule).toContain('user-select: none');
    expect(rule).toContain('-webkit-user-select: none');
    expect(rule).toContain('-webkit-touch-callout: none');
    expect(rule).toContain('-webkit-user-drag: none');
  });

  test('à l’impression, le contenu scellé est masqué', () => {
    const print = css.slice(css.indexOf('@media print'));
    expect(print).toContain('[data-exit-sealed]');
    expect(print).toContain('visibility: hidden');
  });

  test('la feuille est chargée par l’entrée de l’application, et la garde y est installée une fois', () => {
    const main = readFileSync(join(here, '../../main.tsx'), 'utf8');
    expect(main).toContain("styles/sealed-exit.css'");
    expect(main).toContain('installSealedExitGuard(document)');
    const threadModes = readFileSync(join(here, '../../routes/thread-modes.tsx'), 'utf8');
    expect(threadModes).not.toContain('installSealedExitGuard');
  });
});
