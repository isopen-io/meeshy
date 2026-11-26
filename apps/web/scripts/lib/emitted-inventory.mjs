/**
 * L'INVENTAIRE DES ADRESSES ÉMISES, lu sur le disque du dépôt (#7312) — et la
 * table de ce que le web sert, lue à ses sources.
 *
 * Deux consommateurs, qui ne tournent pas aux mêmes moments, et c'est la raison
 * de ce module :
 *
 *   1. `emitted-addresses-served.test.ts` — sous `bun test`, SANS `dist`. Il
 *      lit `apps/ios` et le SDK : la voie de parité (`scripts/ci/voie-parite.mjs`)
 *      le rejoue donc à CHAQUE poussée, y compris celle qui ne touche qu'iOS —
 *      c'est elle qui fabrique les liens morts ;
 *   2. `check-emitted-addresses.mjs` — sur le `dist` construit, qui juge en
 *      plus que chaque DOCUMENT atteint n'est pas la coquille de l'application.
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

import {
  emailLinkAliases,
  emailSecretLinksIn,
  emittedPathsIn,
  nginxServing,
  pathTableIn,
  selfLinksIn,
} from './emitted-addresses.mjs';
import { screenRoutes } from './v31-routes.mjs';

export const ROOT = new URL('../../../..', import.meta.url).pathname;
export const WEB = join(ROOT, 'apps/web');

/** Où l'on émet. Les témoins, fixtures et catalogues de démonstration n'émettent vers personne. */
export const SOURCES = [
  'apps/ios/Meeshy',
  'apps/ios/MeeshyWidgets',
  'apps/ios/MeeshyNotificationExtension',
  'apps/ios/MeeshyNotificationContentExtension',
  'apps/ios/MeeshyShareExtension',
  'apps/ios/fastlane/metadata',
  'packages/MeeshySDK/Sources',
  'services/gateway/src',
  'packages/shared/utils',
  'packages/shared/types',
  'apps/web/src',
  'apps/web/scripts/prerender-institutional.tsx',
  'apps/web/scripts/prerender-landing.tsx',
];

/** Les tables de chemins, là où elles sont déclarées : leur disparition rougit au lieu de rendre zéro. */
const TABLES = [
  ['packages/shared/utils/content-link.ts', 'CONTENT_WEB_PATHS'],
  ['services/gateway/src/utils/email-secret-link.ts', 'EMAIL_LINK_PATHS'],
];

const EXTENSIONS = /\.(swift|ts|tsx|mjs|xcstrings|strings|plist|txt)$/;
const SKIPPED_DIRS = new Set(['node_modules', 'dist', 'Build', 'build', '__tests__', 'Tests', 'test-support', 'catalog']);
/* `kit.tsx` : le catalogue du kit, écran de développement que seule une construction à fixtures inscrit
   (`KIT_ROUTES`, hors de `ROUTES`) — ses liens ne partent jamais d'une image déployée. */
const SKIPPED_FILE = /\.(test|spec)\.|fixtures|\.d\.ts$|^kit\.tsx$/;

const walk = (dir) =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return SKIPPED_DIRS.has(name) || name.endsWith('Tests') ? [] : walk(path);
    return EXTENSIONS.test(name) && !SKIPPED_FILE.test(name) ? [path] : [];
  });

/** Les sources lues — une racine manquante est une ERREUR : un inventaire vide se lirait « rien de mort ». */
export function sourceFiles(root = ROOT) {
  return SOURCES.flatMap((source) => {
    const path = join(root, source);
    if (!existsSync(path)) throw new Error(`${source} introuvable — l'inventaire des adresses émises en serait amputé`);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

export function emittedInventory(root = ROOT) {
  return [
    ...sourceFiles(root).flatMap((f) => {
      const text = readFileSync(f, 'utf8');
      const file = relative(root, f);
      const self = file.startsWith('apps/web/') ? selfLinksIn(text, file) : [];
      return [...emittedPathsIn(text, file), ...emailSecretLinksIn(text, file), ...self];
    }),
    ...TABLES.flatMap(([file, name]) => pathTableIn(readFileSync(join(root, file), 'utf8'), file, name)),
  ];
}

const isFileUnder = (base, path) => {
  const f = join(base, decodeURIComponent(path));
  return f.startsWith(base) && existsSync(f) && statSync(f).isFile();
};

/** Ce que le web sert : `nginx.conf`, `route-table.tsx`, les alias de `@meeshy/shared`, `public/` (et `dist/` s'il est donné). */
export function servingTable({ root = ROOT, dist = null } = {}) {
  const web = join(root, 'apps/web');
  const table = {
    ...nginxServing(readFileSync(join(web, 'nginx.conf'), 'utf8')),
    screens: screenRoutes(),
    aliases: emailLinkAliases(readFileSync(join(root, 'packages/shared/utils/email-link-secret.ts'), 'utf8')),
    isFile: (path) => [join(web, 'public'), ...(dist === null ? [] : [dist])].some((base) => isFileUnder(base, path)),
  };
  if (table.appPrefix === null) throw new Error('nginx.conf ne déclare plus `$meeshy_app_route` — aucun écran ne se jugerait');
  if (table.documents.length === 0) throw new Error('nginx.conf ne déclare plus aucun document prérendu');
  return table;
}
