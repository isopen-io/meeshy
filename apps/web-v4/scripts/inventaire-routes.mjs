#!/usr/bin/env node
/**
 * ÉNUMÈRE les routes servies par chaque application web du dépôt.
 *
 * L'inventaire de parité (#5492) ne peut pas être écrit de mémoire : une route
 * oubliée est un lien mort le jour de la bascule, et on ne s'en aperçoit qu'en
 * production. Ce script est donc la SOURCE de `parite.md` — il se rejoue, et le
 * jour où il rend une route absente du tableau, c'est le tableau qui a tort.
 *
 * Il énumère les DEUX legs, et pas seulement la v3 :
 *   apps/web    — le legacy, ce qui sert meeshy.me AUJOURD'HUI
 *   apps/web-v3 — la refonte gelée
 * Le risque de casser un lien existant vient du PREMIER. Cadrer l'inventaire
 * sur la v3 seule laisserait tomber `/signup/affiliate/:token`,
 * `/auth/magic-link` et les quatre adresses de conversation du legacy — dont
 * trois n'ont jamais eu d'équivalent en v3.
 */
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const RACINE = new URL('../../..', import.meta.url).pathname;

function routes(app) {
  const base = join(RACINE, app, 'app');
  const sortie = [];
  const parcourt = (rep, url) => {
    let entrees;
    try {
      entrees = readdirSync(rep, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entrees) {
      if (e.name === 'node_modules') continue;
      const chemin = join(rep, e.name);
      if (e.isDirectory()) {
        // Un segment de GROUPE — « (connected) » — n'apparaît pas dans l'URL.
        const segment = /^\(.*\)$/.test(e.name) ? '' : `/${e.name}`;
        parcourt(chemin, url + segment);
      } else if (e.name === 'page.tsx' || e.name === 'route.ts') {
        sortie.push({ url: url || '/', genre: e.name === 'route.ts' ? 'gestionnaire' : 'page' });
      }
    }
  };
  try {
    statSync(base);
  } catch {
    return [];
  }
  parcourt(base, '');
  return sortie.sort((a, b) => a.url.localeCompare(b.url));
}

const legacy = routes('apps/web');
const v3 = routes('apps/web-v3');
const v4 = routes('apps/web-v4');

const urls = new Set([...legacy, ...v3, ...v4].map((r) => r.url));
const dans = (liste, url) => liste.some((r) => r.url === url);

if (process.argv.includes('--json')) {
  console.log(
    JSON.stringify(
      [...urls].sort().map((url) => ({
        url,
        legacy: dans(legacy, url),
        v3: dans(v3, url),
        v4: dans(v4, url),
      })),
      null,
      2,
    ),
  );
} else {
  console.log(`  apps/web     ${legacy.length} routes  (le legacy — sert meeshy.me)`);
  console.log(`  apps/web-v3  ${v3.length} routes  (gelée)`);
  console.log(`  apps/web-v4  ${v4.length} routes`);
  console.log(`  union        ${urls.size} adresses distinctes\n`);
  const orphelines = [...urls].sort().filter((u) => dans(legacy, u) && !dans(v3, u));
  console.log(`  ${orphelines.length} routes du LEGACY sans équivalent en v3 — celles que cadrer`);
  console.log(`  l'inventaire sur la v3 seule aurait laissé tomber :\n`);
  for (const u of orphelines) console.log(`    ${u}`);
}
