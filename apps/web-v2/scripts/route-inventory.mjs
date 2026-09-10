#!/usr/bin/env node
/**
 * ÉNUMÈRE les routes servies par chaque application web du dépôt.
 *
 * L'inventaire de parité (#5492) ne peut pas être écrit de mémoire : une route
 * oubliée est un lien mort le jour de la bascule, et on ne s'en aperçoit qu'en
 * production. Ce script est donc la SOURCE de `parity.md` — il se rejoue, et le
 * jour où il rend une route absente du tableau, c'est le tableau qui a tort.
 *
 * Les trois applications ne se lisent pas de la même façon, et c'est la raison
 * du détour par `lib/v31-routes.mjs` : les deux premières suivent la convention
 * Next.js (`page.tsx` / `route.ts`), la v3.1 déclare ses adresses à la main. Un
 * énumérateur qui ne connaît qu'une convention ne dit pas « zéro route » — il
 * ne dit rien, et son silence se lit comme un zéro.
 *
 * Il énumère les DEUX legs, et pas seulement la v3 :
 *   apps/web        — le legacy, ce qui sert meeshy.me AUJOURD'HUI
 *   apps/web-old-version3 — l'ancienne refonte, ANNULÉE le 2026-09-07
 *   apps/web-v3     — la v3.1, le chantier (ex web-v4)
 * Le risque de casser un lien existant vient du PREMIER. Cadrer l'inventaire
 * sur la v3 seule laisserait tomber `/signup/affiliate/:token`,
 * `/auth/magic-link` et les quatre adresses de conversation du legacy — dont
 * trois n'ont jamais eu d'équivalent en v3.
 */
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { v31Routes } from './lib/v31-routes.mjs';

const ROOT = new URL('../../..', import.meta.url).pathname;

function routes(app) {
  const base = join(ROOT, app, 'app');
  const output = [];
  const walk = (dir, url) => {
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (e.name === 'node_modules') continue;
      const path = join(dir, e.name);
      if (e.isDirectory()) {
        // Un segment de GROUPE — « (connected) » — n'apparaît pas dans l'URL.
        const segment = /^\(.*\)$/.test(e.name) ? '' : `/${e.name}`;
        walk(path, url + segment);
      } else if (e.name === 'page.tsx' || e.name === 'route.ts') {
        output.push({ url: url || '/', kind: e.name === 'route.ts' ? 'gestionnaire' : 'page' });
      }
    }
  };
  try {
    statSync(base);
  } catch {
    return [];
  }
  walk(base, '');
  return output.sort((a, b) => a.url.localeCompare(b.url));
}

const legacy = routes('apps/web');
const cancelled = routes('apps/web-old-version3');
// La v3.1 n'a PAS la convention Next.js que `routes()` sait lire : ses adresses
// sont écrites à la main dans `src/routes/route-table.tsx`, et ses cinq
// documents institutionnels sont pré-rendus hors du routeur. `routes()` y
// rendait donc `[]` — un silence que ce tableau a affiché comme un zéro
// pendant tout le cadrage de #5492 (#5669).
const v31 = v31Routes();

const urls = new Set([...legacy, ...cancelled, ...v31].map((r) => r.url));
const dans = (list, url) => list.some((r) => r.url === url);

if (process.argv.includes('--json')) {
  console.log(
    JSON.stringify(
      [...urls].sort().map((url) => ({
        url,
        legacy: dans(legacy, url),
        cancelled: dans(cancelled, url),
        v31: dans(v31, url),
      })),
      null,
      2,
    ),
  );
} else {
  console.log(`  apps/web         ${legacy.length} routes  (le legacy — sert meeshy.me)`);
  console.log(`  apps/web-old-version3  ${cancelled.length} routes  (l'ancienne refonte, ANNULÉE)`);
  const ecrans = v31.filter((r) => r.kind === 'écran').length;
  console.log(
    `  apps/web-v3      ${v31.length} routes  (la v3.1 — le chantier : ` +
      `${ecrans} écrans + ${v31.length - ecrans} documents pré-rendus)`,
  );
  console.log(`  union            ${urls.size} adresses distinctes\n`);
  const orphans = [...urls].sort().filter((u) => dans(legacy, u) && !dans(cancelled, u));
  console.log(`  ${orphans.length} routes du LEGACY sans équivalent dans l'ancienne refonte —`);
  console.log(`  celles que cadrer l'inventaire sur elle seule aurait laissé tomber :\n`);
  for (const u of orphans) console.log(`    ${u}`);
}
