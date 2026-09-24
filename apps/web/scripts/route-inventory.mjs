#!/usr/bin/env node
/**
 * ÉNUMÈRE les routes servies par chaque application web du dépôt.
 *
 * L'inventaire de parité (#5492) ne peut pas être écrit de mémoire : une route
 * oubliée est un lien mort le jour de la bascule, et on ne s'en aperçoit qu'en
 * production. Ce script est donc la SOURCE de `parity.md` — il se rejoue, et le
 * jour où il rend une route absente du tableau, c'est le tableau qui a tort.
 *
 * Les deux applications ne se lisent pas de la même façon, et c'est la raison
 * du détour par `lib/v31-routes.mjs` : le legacy suivait la convention Next.js
 * (`page.tsx` / `route.ts`), l'application déclare ses adresses à la main. Un
 * énumérateur qui ne connaît qu'une convention ne dit pas « zéro route » — il
 * ne dit rien, et son silence se lit comme un zéro.
 *
 * LE LEGACY SE LIT DANS LE TAG `legacy-web-final`, PLUS SUR LE DISQUE (#7668).
 * Il a quitté le dépôt, et l'application a pris son chemin `apps/web` : lire
 * `apps/web/app/` rendrait `[]` et afficherait « 0 route du legacy » — le
 * silence ci-dessus. Ses adresses, elles, vivent encore dans les liens déjà
 * envoyés (`/signup/affiliate/:token`, `/auth/magic-link`, les quatre adresses
 * de conversation) : l'inventaire les garde, depuis le gel. Sans le tag (clone
 * superficiel), le script le DIT au lieu d'afficher un zéro.
 */
import { execFileSync } from 'node:child_process';

import { v31Routes } from './lib/v31-routes.mjs';

const ROOT = new URL('../../..', import.meta.url).pathname;
const LEGACY_TAG = 'legacy-web-final';
const LEGACY_APP_DIR = 'apps/web/app/';

/** Fichiers `app/**` du legacy, lus dans le tag ; `null` si le tag est absent. */
function legacyAppFiles() {
  try {
    return execFileSync(
      'git',
      ['ls-tree', '-r', '--name-only', LEGACY_TAG, '--', LEGACY_APP_DIR],
      { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
    )
      .split('\n')
      .filter(Boolean);
  } catch {
    return null;
  }
}

/** Convention Next.js : `page.tsx` / `route.ts`, les segments `(groupe)` sont muets. */
export function nextRoutes(files) {
  return files
    .map((file) => file.slice(LEGACY_APP_DIR.length).split('/'))
    .filter((parts) => parts.at(-1) === 'page.tsx' || parts.at(-1) === 'route.ts')
    .filter((parts) => !parts.includes('node_modules'))
    .map((parts) => {
      const url = parts
        .slice(0, -1)
        .filter((segment) => !/^\(.*\)$/.test(segment))
        .map((segment) => `/${segment}`)
        .join('');
      return { url: url || '/', kind: parts.at(-1) === 'route.ts' ? 'gestionnaire' : 'page' };
    })
    .sort((a, b) => a.url.localeCompare(b.url));
}

const legacyFiles = legacyAppFiles();
const legacy = legacyFiles ? nextRoutes(legacyFiles) : [];
// L'application n'a PAS la convention Next.js : ses adresses sont écrites à la
// main dans `src/routes/route-table.tsx`, et ses documents institutionnels
// sont pré-rendus hors du routeur (#5669).
const v31 = v31Routes();

const urls = new Set([...legacy, ...v31].map((r) => r.url));
const dans = (list, url) => list.some((r) => r.url === url);

if (process.argv.includes('--json')) {
  console.log(
    JSON.stringify(
      [...urls].sort().map((url) => ({
        url,
        legacy: dans(legacy, url),
        v31: dans(v31, url),
      })),
      null,
      2,
    ),
  );
} else {
  console.log(
    legacyFiles
      ? `  legacy (${LEGACY_TAG})  ${legacy.length} routes  (le legacy Next.js, gelé — ses liens circulent encore)`
      : `  legacy                 INCONNU — tag \`${LEGACY_TAG}\` absent (git fetch origin tag ${LEGACY_TAG})`,
  );
  const ecrans = v31.filter((r) => r.kind === 'écran').length;
  console.log(
    `  apps/web               ${v31.length} routes  (` +
      `${ecrans} écrans + ${v31.length - ecrans} documents pré-rendus)`,
  );
  console.log(`  union                  ${urls.size} adresses distinctes\n`);
  const orphans = [...urls].sort().filter((u) => dans(legacy, u) && !dans(v31, u));
  console.log(`  ${orphans.length} routes du LEGACY sans équivalent dans l'application :\n`);
  for (const u of orphans) console.log(`    ${u}`);
}
