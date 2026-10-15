import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, test } from 'bun:test';

/**
 * LE FOND DES BARRES SYSTÈME SUIT LE THÈME DE L'APP SOUS ANDROID 15 (#9533).
 *
 * Chrome peint sa barre de la couleur `theme-color` de la page. Sous l'API 35,
 * la coque n'est pas bord à bord : le thème `DayNight` peint les barres selon
 * le SYSTÈME, et `SystemBars.setStyle` ne règle que leurs icônes. Thème clair
 * dans l'app : icônes sombres sur barre noire, illisibles. Le pont
 * `MeeshySystemBars` peint le fond ; ses règles vivent dans `SystemBarPaint`
 * (JUnit), ce témoin garde leur branchement.
 */

const JAVA = join(dirname(fileURLToPath(import.meta.url)), '..', 'android', 'app', 'src', 'main', 'java', 'me', 'meeshy', 'app');

function sansCommentaires(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
}

describe('la coque peint le fond des barres système sous Android 15 (#9533)', () => {
  test('l’activité enregistre le pont', () => {
    const activite = sansCommentaires(readFileSync(join(JAVA, 'MainActivity.java'), 'utf8'));
    expect(activite).toContain('registerPlugin(MeeshySystemBarsPlugin.class);');
  });

  test('le pont peint chaque barre seulement là où ses règles le disent', () => {
    const pont = sansCommentaires(readFileSync(join(JAVA, 'MeeshySystemBarsPlugin.java'), 'utf8'));
    expect(pont).toContain('@CapacitorPlugin(name = "MeeshySystemBars")');
    expect(pont).toContain('SystemBarPaint.opaque(');
    expect(pont).toMatch(/SystemBarPaint\.paintsStatus\(Build\.VERSION\.SDK_INT\)[\s\S]*setStatusBarColor\(/);
    expect(pont).toMatch(/SystemBarPaint\.paintsNavigation\(Build\.VERSION\.SDK_INT\)[\s\S]*setNavigationBarColor\(/);
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
