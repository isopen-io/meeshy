/**
 * Copie le catalogue d'apparence (gamme de 16 couleurs, fonds, bannières,
 * contours, cadres de bannière, noms en 7 langues) dans le SDK Android — le
 * même rendu que la copie iOS, pas un second :
 *
 *   cd packages/shared && bun scripts/sync-appearance-catalog-android.ts
 *
 * Le chargeur Android (`AppearanceCatalogLoader`, sdk-core) ne lit qu'UN
 * fichier embarqué en assets. `__tests__/appearance-catalog-android-copy.test.ts`
 * exige que la copie committée soit égale à `renderAppearanceCatalog()`.
 */
import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderAppearanceCatalog } from './sync-appearance-catalog-ios.js';

export const ANDROID_CATALOG_PATH = 'apps/android/sdk-core/src/main/assets/appearance-catalog.json';

export { renderAppearanceCatalog };

const HERE = dirname(fileURLToPath(import.meta.url));
const isMain = process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  writeFileSync(resolve(HERE, '../../..', ANDROID_CATALOG_PATH), renderAppearanceCatalog());
  process.stdout.write(`${ANDROID_CATALOG_PATH} écrit\n`);
}
