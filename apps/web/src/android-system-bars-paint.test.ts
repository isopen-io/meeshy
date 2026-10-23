import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, test } from 'bun:test';

/**
 * LA COQUE EST BORD À BORD À TOUTE VERSION (#9533, #12447).
 *
 * Sous l'API 35, la coque peignait elle-même ses barres de la `theme-color`
 * de la page par `setStatusBarColor` / `setNavigationBarColor`. Ces API sont
 * obsolètes depuis Android 15, et la Play Console les signale. La coque est
 * désormais bord à bord partout (`EdgeToEdge.enable`) : les barres sont
 * transparentes, la page ou le fond de fenêtre se voit derrière, comme sous
 * Android 15.
 */

const JAVA = join(dirname(fileURLToPath(import.meta.url)), '..', 'android', 'app', 'src', 'main', 'java', 'me', 'meeshy', 'app');

function sansCommentaires(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
}

describe('la coque est bord à bord à toute version (#12447)', () => {
  test('l’activité enregistre le pont et passe bord à bord avant de construire le pont', () => {
    const activite = sansCommentaires(readFileSync(join(JAVA, 'MainActivity.java'), 'utf8'));
    expect(activite).toContain('registerPlugin(MeeshySystemBarsPlugin.class);');
    expect(activite).toMatch(/EdgeToEdge\.enable\(this\);\s*super\.onCreate\(savedInstanceState\);/);
  });

  test('aucune source de la coque n’appelle les API de barres obsolètes', () => {
    const sources = readdirSync(JAVA)
      .filter((nom) => nom.endsWith('.java'))
      .map((nom) => sansCommentaires(readFileSync(join(JAVA, nom), 'utf8')));
    expect(sources.some((source) => /setStatusBarColor\(|setNavigationBarColor\(/.test(source))).toBe(false);
  });

  test('le pont lit la couleur de la page par ses règles', () => {
    const pont = sansCommentaires(readFileSync(join(JAVA, 'MeeshySystemBarsPlugin.java'), 'utf8'));
    expect(pont).toContain('@CapacitorPlugin(name = "MeeshySystemBars")');
    expect(pont).toContain('SystemBarPaint.opaque(');
  });
});

/**
 * LE FOND DE LA FENÊTRE SUIT LE SCHÉMA CHOISI DANS L'APP (#10085).
 *
 * Sous une WebView < 140, `SystemBars` rembourre la fenêtre au lieu de passer
 * les encoches à la page : le fond de la fenêtre se voit derrière la barre
 * d'état et la barre de gestes. Il venait du thème `DayNight`, donc du schéma
 * du SYSTÈME : application en sombre sur un téléphone clair, deux bandes
 * blanches. Le pont le repeint de la même `theme-color`, à toute version.
 */
describe('la coque peint le fond de sa fenêtre du schéma de l’app (#10085)', () => {
  test('le pont repeint le fond de la fenêtre, hors de toute règle de version', () => {
    const pont = sansCommentaires(readFileSync(join(JAVA, 'MeeshySystemBarsPlugin.java'), 'utf8'));
    expect(pont).toMatch(/window\.setBackgroundDrawable\(new ColorDrawable\(color\)\);/);
    const ligne = pont.split('\n').find((l) => l.includes('setBackgroundDrawable(')) ?? '';
    expect(ligne).not.toContain('SystemBarPaint.');
  });
});
