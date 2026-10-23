import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, test } from 'bun:test';

import { resolveCapacitorConfig } from '../capacitor.config';

/**
 * LA BARRE DU NAVIGATEUR EST PEINTE DE LA SURFACE DE L'ÉCRAN (#10005, note
 * « plat » de la planche : « theme-color = surface »).
 *
 * Le corps de chaque écran se peint de `--ios-surface` (`app.css`,
 * `institutional.css`, la landing), la palette générée depuis
 * `MeeshyColors.swift`. La barre d'adresse de Chrome Android, la barre d'état
 * de la PWA installée, le fond de la WebView avant la première peinture et
 * l'écran de lancement de la coque portaient encore `#0b0c14` (sombre) et
 * `#f1f3f9` (clair) — la table héritée de l'ancienne refonte : une bande d'une
 * autre teinte au-dessus de chaque écran. Chaque site lit désormais la même
 * valeur que la surface, et ce témoin les relit tous contre la palette.
 */

const APP = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path: string) => readFileSync(join(APP, path), 'utf8');

function surfaces(): { readonly dark: string; readonly light: string } {
  const tokens = read('../../packages/design-tokens/ios.css');
  const [dark, light] = [...tokens.matchAll(/--ios-surface:\s*(#[0-9a-fA-F]{3,8})\s*;/g)].map((match) => match[1]?.toLowerCase());
  if (dark === undefined || light === undefined) throw new Error('--ios-surface introuvable dans packages/design-tokens/ios.css');
  return { dark, light };
}

function themeColors(html: string): Readonly<Record<string, string>> {
  const metas = [...html.matchAll(/<meta\s+name="theme-color"\s+content="([^"]+)"\s+media="\(prefers-color-scheme:\s*(dark|light)\)"/g)];
  return Object.fromEntries(metas.map((meta) => [meta[2] ?? '', (meta[1] ?? '').toLowerCase()]));
}

const surface = surfaces();

describe('theme-color = surface (#10005)', () => {
  test('index.html : la barre du navigateur se peint de la surface, dans les deux schémas', () => {
    expect(themeColors(read('index.html'))).toEqual({ dark: surface.dark, light: surface.light });
  });

  test('les pages institutionnelles prérendues aussi', () => {
    expect(themeColors(read('scripts/prerender-institutional.tsx'))).toEqual({ dark: surface.dark, light: surface.light });
  });

  test('le manifeste de la PWA installée : barre et fond de lancement', () => {
    const config = read('vite/pwa.ts');
    expect(config.match(/theme_color:\s*'([^']+)'/)?.[1]?.toLowerCase()).toBe(surface.dark);
    expect(config.match(/background_color:\s*'([^']+)'/)?.[1]?.toLowerCase()).toBe(surface.dark);
  });

  test('la WebView des coques, avant la première peinture', () => {
    const config = resolveCapacitorConfig({});
    expect(config.android?.backgroundColor?.toLowerCase()).toBe(surface.dark);
    expect(config.ios?.backgroundColor?.toLowerCase()).toBe(surface.dark);
  });

  test("l'écran de lancement de la coque Android", () => {
    const colors = read('android/app/src/main/res/values/colors.xml');
    expect(colors.match(/<color name="splash_background">([^<]+)<\/color>/)?.[1]?.toLowerCase()).toBe(surface.dark);
  });

  test('la fenêtre de la coque Android, derrière ses barres système, dans les deux schémas', () => {
    const light = read('android/app/src/main/res/values/colors.xml');
    const dark = read('android/app/src/main/res/values-night/colors.xml');
    expect(light.match(/<color name="surface">([^<]+)<\/color>/)?.[1]?.toLowerCase()).toBe(surface.light);
    expect(dark.match(/<color name="surface">([^<]+)<\/color>/)?.[1]?.toLowerCase()).toBe(surface.dark);
    const styles = read('android/app/src/main/res/values/styles.xml');
    const theme = styles.match(/<style name="AppTheme\.NoActionBar"[\s\S]*?<\/style>/)?.[0] ?? '';
    expect(theme).toContain('<item name="android:windowBackground">@color/surface</item>');
  });
});
