#!/usr/bin/env node
/**
 * VÉRIFIE QU'UN SEUL SITE RÉSOUT `apiConfig.source` EN DÉPENDANCES D'APPEL.
 *
 * POURQUOI CE TÉMOIN EXISTE (#6151). `src/lib/api/deps.ts` déclare
 * `apiDeps`, l'ADAPTATEUR UNIQUE qui résout `apiConfig.source` — mais rien
 * n'empêchait un huitième site de reconstruire `{ source: apiConfig.source,
 * … }` lui-même. Revue de #5652 : SEPT sites de production le faisaient déjà
 * avant ce lot (`query.ts`, `list-header.tsx`, `conversation-new.tsx`,
 * `summary-host.tsx`, `use-reader.ts`, `progression-page.tsx`,
 * `progression.tsx`) — la même jumelle latente que les trois familles de
 * résolveurs du Prisme qui ont divergé faute d'un site unique
 * (`CLAUDE.md` racine, § Prisme). Un `grep` qui rougit à la première
 * divergence coûte moins qu'une revue qui la trouve après coup.
 *
 * CE QU'IL VÉRIFIE : aucune occurrence du motif `source: apiConfig.source`
 * hors de `src/lib/api/deps.ts`, la définition de `apiDeps` elle-même.
 * Volontairement TEXTUEL, comme `check-git-tracking.mjs` : simple à lire,
 * simple à ne jamais désynchroniser d'une règle plus subtile.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { extname, join, relative } from 'node:path';

const SRC = new URL('../src', import.meta.url).pathname.replace(/\/$/, '');
const ADAPTER = 'lib/api/deps.ts';
const PATTERN = /\bsource:\s*apiConfig\.source\b/;
const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx']);

const files = (dir) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return files(path);
    return SOURCE_EXTENSIONS.has(extname(entry.name)) ? [path] : [];
  });

const offenders = files(SRC)
  .map((path) => ({ path, rel: relative(SRC, path) }))
  .filter(({ rel }) => rel !== ADAPTER)
  .flatMap(({ path, rel }) =>
    readFileSync(path, 'utf8')
      .split('\n')
      .flatMap((line, index) => (PATTERN.test(line) ? [`${rel}:${index + 1}`] : [])),
  );

if (offenders.length > 0) {
  console.error(
    `\n  ${offenders.length} site(s) reconstruisent \`source: apiConfig.source\` en dehors de` +
      ` l'adaptateur unique (\`src/${ADAPTER}\`) :\n`,
  );
  for (const at of offenders) console.error(`    · src/${at}`);
  console.error(
    '\n  Importer `apiDeps` (ou `.source` sur `apiDeps`) depuis `@/lib/api/deps` au lieu de relire' +
      ' `apiConfig.source` — un second site divergerait de la résolution partagée sans qu\'aucun test' +
      " ne le voie (#6151).\n",
  );
  process.exit(1);
}

console.log('  Un seul site résout apiConfig.source en dépendances (src/lib/api/deps.ts).');
