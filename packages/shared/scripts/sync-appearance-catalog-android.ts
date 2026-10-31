/**
 * Copie le catalogue d'apparence (gamme de 16 couleurs, fonds, bannières,
 * contours, cadres de bannière, noms en 7 langues) dans le SDK Android — le
 * même rendu que la copie iOS, pas un second :
 *
 *   cd packages/shared && bun scripts/sync-appearance-catalog-android.ts
 *
 * Le chargeur Android (`AppearanceCatalogLoader`, sdk-core) ne lit qu'UN
 * fichier embarqué en assets. Les couches Lottie que ce catalogue référence
 * sont copiées à côté (`appearance-lottie/<sha16>.json`, #13952) : Android les
 * joue sans réseau dès le premier rendu, comme le web qui les embarque. `__tests__/appearance-catalog-android-copy.test.ts`
 * exige que la copie committée soit égale à `renderAppearanceCatalog()`.
 */
import { copyFileSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderAppearanceCatalog } from './sync-appearance-catalog-ios.js';

export const ANDROID_CATALOG_PATH = 'apps/android/sdk-core/src/main/assets/appearance-catalog.json';
export const ANDROID_LOTTIE_DIR = 'apps/android/sdk-core/src/main/assets/appearance-lottie';
const SHARED_LOTTIE_DIR = 'packages/shared/design/appearance/lottie';

/** Les fichiers Lottie qu'un catalogue rendu référence, chacun une fois. */
export function referencedLottieFiles(catalogText: string): string[] {
  const found = new Set<string>();
  const walk = (node: unknown): void => {
    if (Array.isArray(node)) {
      node.forEach(walk);
      return;
    }
    if (node === null || typeof node !== 'object') return;
    const record = node as Record<string, unknown>;
    const lottie = record.lottie as { src?: unknown } | undefined;
    if (lottie && typeof lottie.src === 'string') found.add(lottie.src);
    Object.values(record).forEach(walk);
  };
  walk(JSON.parse(catalogText));
  return [...found].sort();
}

export { renderAppearanceCatalog };

const HERE = dirname(fileURLToPath(import.meta.url));
const isMain = process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  const root = resolve(HERE, '../../..');
  const catalog = renderAppearanceCatalog();
  writeFileSync(resolve(root, ANDROID_CATALOG_PATH), catalog);
  const lottieDir = resolve(root, ANDROID_LOTTIE_DIR);
  rmSync(lottieDir, { recursive: true, force: true });
  mkdirSync(lottieDir, { recursive: true });
  const files = referencedLottieFiles(catalog);
  files.forEach((file) => copyFileSync(resolve(root, SHARED_LOTTIE_DIR, file), resolve(lottieDir, file)));
  process.stdout.write(`${ANDROID_CATALOG_PATH} écrit, ${files.length} couches Lottie dans ${ANDROID_LOTTIE_DIR}\n`);
}
