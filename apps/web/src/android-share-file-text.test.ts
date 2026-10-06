import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, test } from 'bun:test';

/**
 * LE TEXTE QUI ACCOMPAGNE UN FICHIER PARTAGÉ PART AVEC LUI DANS LA COQUE
 * ANDROID (#9492) — `navigator.share({ files, text })` remet l'image ET le
 * texte à l'application choisie ; le pont `MeeshyShare.shareFile` ne posait que
 * le fichier, et la carte photo partait sans son lien de parrainage.
 */

const PLUGIN = join(dirname(fileURLToPath(import.meta.url)), '..', 'android', 'app', 'src', 'main', 'java', 'me', 'meeshy', 'app', 'MeeshySharePlugin.java');

function corpsDe(code: string, signature: string): string {
  const debut = code.indexOf(signature);
  expect(debut).toBeGreaterThan(-1);
  const ouverture = code.indexOf('{', debut);
  let profondeur = 0;
  for (let i = ouverture; i < code.length; i += 1) {
    if (code[i] === '{') profondeur += 1;
    if (code[i] === '}') profondeur -= 1;
    if (profondeur === 0) return code.slice(ouverture, i + 1);
  }
  return code.slice(ouverture);
}

describe('le fichier partagé depuis la coque Android emporte son texte (#9492)', () => {
  test('`shareFile` lit le texte offert et le pose en EXTRA_TEXT', () => {
    const source = readFileSync(PLUGIN, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    const partage = corpsDe(source, 'public void shareFile(');
    expect(partage).toContain('call.getString("text"');
    expect(partage).toContain('Intent.EXTRA_TEXT');
  });
});
