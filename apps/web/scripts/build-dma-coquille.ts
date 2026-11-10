/**
 * LA CONSTRUCTION de la coquille « ami WhatsApp » (#17116) : un module pour le
 * navigateur (la page, l'appareil, le client de la porte et le pont libsignal du
 * web), la page HTML et le WASM du pont, tel quel. Lancée par l'image de la
 * passerelle (`services/gateway/Dockerfile`) sur les seules sources copiées
 * `src/lib/dma-coquille/` et `src/lib/e2ee/` — aucune dépendance installée.
 *
 *   bun scripts/build-dma-coquille.ts <répertoire de sortie>
 */
import { copyFileSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

type BunRuntime = {
  readonly build: (options: Record<string, unknown>) => Promise<{ readonly success: boolean; readonly logs: readonly unknown[] }>;
};
const Bun = (globalThis as unknown as { readonly Bun: BunRuntime }).Bun;
const isMain = (import.meta as ImportMeta & { readonly main?: boolean }).main === true;

const SOURCES = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'lib');
const ENTRY = join(SOURCES, 'dma-coquille', 'coquille-page-entry.ts');
const PAGE = join(SOURCES, 'dma-coquille', 'coquille.html');
const WASM = join(SOURCES, 'e2ee', 'libsignal', 'libsignal_wasm_bg.wasm');

export const buildDmaCoquille = async (outDir: string): Promise<void> => {
  mkdirSync(outDir, { recursive: true });
  const built = await Bun.build({ entrypoints: [ENTRY], outdir: outDir, target: 'browser', format: 'esm', splitting: false, minify: true, naming: 'coquille.js' });
  if (!built.success) throw new AggregateError(built.logs, 'construction de la coquille en échec');
  readdirSync(outDir)
    .filter((name) => name !== 'coquille.js')
    .forEach((name) => rmSync(join(outDir, name), { recursive: true, force: true }));
  copyFileSync(PAGE, join(outDir, 'index.html'));
  copyFileSync(WASM, join(outDir, 'libsignal_wasm_bg.wasm'));
};

if (isMain) {
  const outDir = process.argv[2];
  if (!outDir) throw new Error('usage : bun scripts/build-dma-coquille.ts <répertoire de sortie>');
  await buildDmaCoquille(outDir);
}
