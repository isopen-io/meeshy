import { describe, expect, test } from 'bun:test';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * LE MODÈLE À 478 POINTS EST SERVI PAR MEESHY ET NE SE CHARGE QU'À LA DEMANDE
 * (W15, #11321) — mêmes gardes que le segmenter (#8471) : un chunk que seul un
 * `import()` atteint, jamais précaché, un budget nommé, aucun tiers.
 */
const here = dirname(fileURLToPath(import.meta.url));
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
      .filter((path) => !path.endsWith('face-landmarker.ts') && !path.endsWith('video-effects-segmentation.ts'))
      .filter((path) => /^\s*(import|export)\s[^;]*from\s+['"][^'"]*face-landmarker['"]/m.test(read(path)));
    expect(offenders).toEqual([]);
  });

  test('il rejoint le chunk du segmenter, que le navigateur ne demande que par import()', () => {
    expect(read(join(here, 'video-effects-segmentation.ts'))).toMatch(/export \{ loadFaceLandmarker \} from '\.\/face-landmarker'/);
    expect(read(join(webRoot, 'src', 'lib', 'meeshy-lens', 'lens-browser.ts'))).toMatch(/import\(['"]@\/lib\/calls\/video-effects-segmentation['"]\)\.then\(\(module\) => module\.loadFaceLandmarker\(\)\)/);
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

  test('le service worker ne précache ni son chunk ni son WebAssembly', () => {
    const pwa = read(join(webRoot, 'vite', 'pwa.ts'));
    expect(pwa).toContain("'assets/video-effects-segmentation-*.js'");
    expect(pwa).toContain("'assets/vision_wasm_*'");
    expect(pwa).toMatch(/globPatterns: \[[^\]]*\]/);
    expect(pwa.match(/globPatterns: \[[^\]]*\]/)?.[0]).not.toMatch(/task|tflite|wasm/);
  });

  test('le budget du chunk dit le modèle de plus, et reste dynamique seulement', () => {
    const budgets = JSON.parse(read(join(webRoot, 'budgets.json'))) as { on_demand_chunks: Record<string, { pattern: string; dynamic_only?: boolean; kb: { value: number; source: string } }> };
    const entry = budgets.on_demand_chunks.call_video_segmentation;
    expect(entry?.dynamic_only).toBe(true);
    expect(entry?.kb.source).toContain('#11321');
    expect(entry?.kb.source).toContain('face-landmarker-*.task');
  });
});
