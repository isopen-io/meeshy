import { resolve } from 'node:path';

import { describe, expect, test } from 'bun:test';

import { resolveDistDir } from './resolve-dist-dir.mjs';

/**
 * LE PRÉCHAUFFAGE ÉCRIVAIT TOUJOURS DANS `../dist`, MÊME QUAND LE BUILD
 * VISAIT `dist-capacitor/` (#5812, élargit #5821).
 *
 * `resolveDistDir` est le site UNIQUE qui décide où écrire : `--outDir` de
 * `vite build` doit gagner sur le repli, et RIEN d'autre ne doit pouvoir le
 * déguiser (une chaîne vide, un argument absent).
 */
describe('resolveDistDir — le préchauffage écrit là où le build a construit', () => {
  test('sans argument explicite, retombe sur ../dist relatif au script', () => {
    expect(resolveDistDir('/repo/web-v2/scripts', [])).toBe(resolve('/repo/web-v2/scripts', '../dist'));
  });

  test('un troisième argv absent (bun run script.tsx) retombe aussi sur ../dist', () => {
    expect(resolveDistDir('/repo/web-v2/scripts', ['bun', 'script.tsx'])).toBe(
      resolve('/repo/web-v2/scripts', '../dist'),
    );
  });

  test('un troisième argv EXPLICITE gagne — la sortie réelle de vite build --outDir', () => {
    expect(resolveDistDir('/repo/web-v2/scripts', ['bun', 'script.tsx', '/repo/web-v2/dist-capacitor'])).toBe(
      '/repo/web-v2/dist-capacitor',
    );
  });

  test('un argv EXPLICITE relatif se résout contre le cwd, pas contre `here`', () => {
    const relatif = resolveDistDir('/repo/web-v2/scripts', ['bun', 'script.tsx', 'dist-capacitor']);
    expect(relatif).toBe(resolve('dist-capacitor'));
    expect(relatif).not.toContain('/repo/web-v2/scripts');
  });

  test('une chaîne VIDE ne déguise pas une absence — retombe sur ../dist', () => {
    expect(resolveDistDir('/repo/web-v2/scripts', ['bun', 'script.tsx', ''])).toBe(
      resolve('/repo/web-v2/scripts', '../dist'),
    );
  });
});
