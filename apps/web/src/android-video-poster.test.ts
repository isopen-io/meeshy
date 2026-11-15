import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, test } from 'bun:test';

/**
 * UNE VIDÉO SANS IMAGE D'APERÇU MONTRE LE FOND DE SON ÉLÉMENT, COMME SUR LE WEB (#8547).
 *
 * Sans attribut `poster`, un `<video>` du web laisse voir le fond de son
 * élément jusqu'à sa première image. La WebView Android, elle, demande une
 * image à `WebChromeClient.getDefaultVideoPoster()` ; `BridgeWebChromeClient`
 * (Capacitor 8.5.1) ne la fournit pas, et Chromium dessine son icône
 * « lecture » grise sur le flux d'un appel qui démarre ou une vignette du fil.
 * La coque garde le client de Capacitor (permissions, fichiers) et ne lui
 * remplace que cet aperçu et le plein écran (#8594).
 */

const APP = join(dirname(fileURLToPath(import.meta.url)), '..');
const MAIN_ACTIVITY = join(APP, 'android', 'app', 'src', 'main', 'java', 'me', 'meeshy', 'app', 'MainActivity.java');

function sansCommentaires(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
}

describe("l'aperçu vidéo par défaut de la coque Android (#8547)", () => {
  const code = sansCommentaires(readFileSync(MAIN_ACTIVITY, 'utf8'));

  test('la WebView reçoit un client de Capacitor, pas un client nu', () => {
    const client = code.search(/new BridgeWebChromeClient\(\s*getBridge\(\)\s*\)\s*\{/);
    expect(client).toBeGreaterThan(-1);
    expect(code.indexOf('setWebChromeClient(', client)).toBeGreaterThan(client);
  });

  test("l'aperçu par défaut est une image transparente", () => {
    const surcharge = code.indexOf('getDefaultVideoPoster()');
    expect(surcharge).toBeGreaterThan(-1);
    expect(code.slice(surcharge)).toMatch(/Bitmap\.createBitmap\(\s*1\s*,\s*1\s*,\s*Bitmap\.Config\.ARGB_8888\s*\)/);
  });

  test('le client est posé une fois le pont construit', () => {
    const pont = code.indexOf('super.onCreate(savedInstanceState)');
    expect(pont).toBeGreaterThan(-1);
    expect(code.indexOf('setWebChromeClient')).toBeGreaterThan(pont);
  });
});
