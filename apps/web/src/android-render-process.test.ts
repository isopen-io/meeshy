import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, test } from 'bun:test';

/**
 * LA PERTE DU MOTEUR DE RENDU RECHARGE L'APPLICATION, COMME UN ONGLET (#8564).
 *
 * Un navigateur dont le processus de rendu meurt affiche une erreur et
 * recharge l'onglet. Dans la coque, `BridgeWebViewClient` (Capacitor 8.5.1)
 * ne rend `true` à `onRenderProcessGone` que si un `WebViewListener` le fait ;
 * sans lui, Android tue tout le processus et Meeshy se ferme. La coque recrée
 * l'activité, sauf si la perte précédente est trop récente : la règle vit dans
 * `RendererRecovery` (JUnit), ce témoin garde son branchement.
 */

const APP = join(dirname(fileURLToPath(import.meta.url)), '..');
const MAIN_ACTIVITY = join(APP, 'android', 'app', 'src', 'main', 'java', 'me', 'meeshy', 'app', 'MainActivity.java');

function sansCommentaires(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
}

describe('la perte du moteur de rendu dans la coque Android (#8564)', () => {
  const code = sansCommentaires(readFileSync(MAIN_ACTIVITY, 'utf8'));

  test("l'écouteur est posé une fois le pont construit", () => {
    const pont = code.indexOf('super.onCreate(savedInstanceState)');
    expect(pont).toBeGreaterThan(-1);
    expect(code.indexOf('addWebViewListener(')).toBeGreaterThan(pont);
  });

  test("la perte recrée l'activité et le dit au système", () => {
    const perte = code.indexOf('public boolean onRenderProcessGone(');
    expect(perte).toBeGreaterThan(-1);
    const corps = code.slice(perte);
    expect(corps).toMatch(/RendererRecovery\.shouldRecover\(/);
    expect(corps).toMatch(/recreate\(\)/);
    expect(corps).toMatch(/return true;/);
  });
});
