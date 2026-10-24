import { describe, expect, test } from 'bun:test';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * LE MODÈLE À 478 POINTS EST SERVI PAR MEESHY ET NE SE CHARGE QU'À LA DEMANDE
 * (W15, #11321) — mêmes gardes que le segmenter (#8471) : un chunk que seul un
 * `import()` atteint, jamais précaché, un budget nommé, aucun tiers.
 */
const here = import.meta.dir;
const webRoot = join(here, '..', '..', '..');
const read = (path: string): string => readFileSync(path, 'utf8');
const sourcesUnder = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? sourcesUnder(path) : /\.(ts|tsx)$/.test(name) && !/\.test\./.test(name) ? [path] : [];
  });

describe('un chunk atteint par import() seulement', () => {
  test('aucun module ne l’importe statiquement', () => {
    const offenders = sourcesUnder(join(webRoot, 'src'))
      .filter((path) => !path.endsWith('face-landmarker.ts'))
      .filter((path) => /^\s*(import|export)\s[^;]*from\s+['"][^'"]*face-landmarker['"]/m.test(read(path)));
    expect(offenders).toEqual([]);
  });

  test('le chargeur du navigateur le demande par import()', () => {
    expect(read(join(here, 'video-effects-browser.ts'))).toMatch(/import\(['"]\.\/face-landmarker['"]\)/);
  });
});

describe('servi par Meeshy, jamais précaché', () => {
  test('le module ne nomme aucun hôte tiers et sert son modèle et son WebAssembly', () => {
    const source = read(join(here, 'face-landmarker.ts'));
    expect(source).not.toMatch(/https?:\/\//);
    expect(source).toContain("from './face-landmarker.task?url'");
    expect(source).toContain('vision_wasm_module_internal.wasm?url');
  });

  test('le modèle est dans le dépôt et tient en moins de 4 Mio', () => {
    expect(statSync(join(here, 'face-landmarker.task')).size).toBeLessThan(4 * 1024 * 1024);
  });

  test('le service worker ne le précache pas', () => {
    expect(read(join(webRoot, 'vite', 'pwa.ts'))).toContain("'assets/face-landmarker-*.js'");
  });

  test('un budget le nomme, dynamique seulement', () => {
    const budgets = JSON.parse(read(join(webRoot, 'budgets.json'))) as { on_demand_chunks: Record<string, { pattern: string; dynamic_only?: boolean; kb: { value: number } }> };
    const entry = budgets.on_demand_chunks.call_face_landmarker;
    expect(entry?.dynamic_only).toBe(true);
    expect(new RegExp(entry?.pattern ?? '$^').test('assets/face-landmarker-AbCdEf_-.js')).toBe(true);
    expect(entry?.kb.value).toBeGreaterThan(0);
  });
});
