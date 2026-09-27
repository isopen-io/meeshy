#!/usr/bin/env node
// Interdiction des adresses d'API écrites en dur dans le web (#7716).
//
// LE DÉFAUT QU'ELLE FERME
//
// Un chemin d'API s'écrit à UN endroit : le catalogue GÉNÉRÉ depuis
// `services/gateway/route-manifest.json` (`packages/shared/api/endpoints.ts`
// et ses modules par groupe, `packages/shared/api/endpoints/<groupe>.ts`).
// `apps/web` écrivait les siens à la main, requête par requête
// (`path: '/api/v1/…'`) : une route renommée côté serveur ne faisait rougir ni
// le typage ni les tests du web, et le catalogue restait sans client.
//
// La migration (#7716, 2026-09-27) a fait passer le compte de 348 lignes à 0,
// lot par lot, sous un cliquet à deux sens. Le compte étant nul, le cliquet
// est devenu une INTERDICTION : une seule ligne rougit.
//
// CE QU'ELLE LIT
//
// Les LIGNES de `apps/web/src` (`.ts`, `.tsx`, hors `*.test.*`) qui
// contiennent `/api/v1/`, à toute profondeur. Un commentaire compte : une
// adresse recopiée dans un doc-comment se périme au premier renommage
// exactement comme celle d'un appel — on y cite l'entrée du catalogue
// (`admin.usersByUserIdResetPassword`).
//
// Ce qui la remplace, et que la passerelle vérifie : le web importe le module
// du groupe en espace de noms (`import * as adminEndpoints from
// '@meeshy/shared/api/endpoints/admin'`), et `route-auth-coverage.test.ts`
// (gateway) résout chacune de ces références contre le serveur assemblé.
//
// --self-test : un monde synthétique prouve la lecture (commentaires compris,
// tests exclus) puis le verdict.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const WEB_SRC = 'apps/web/src';
const NEEDLE = '/api/v1/';
const TEST_FILE_RE = /\.test\.[^/]*$/;
const SOURCE_RE = /\.tsx?$/;

export const isCountedFile = (name) => SOURCE_RE.test(name) && !TEST_FILE_RE.test(name);

export const offendingLines = (source) =>
  source.split('\n').flatMap((line, index) => (line.includes(NEEDLE) ? [index + 1] : []));

const listFiles = (absDir, relDir) =>
  readdirSync(absDir).flatMap((name) => {
    const absPath = join(absDir, name);
    const relPath = `${relDir}/${name}`;
    if (statSync(absPath).isDirectory()) return name === 'node_modules' ? [] : listFiles(absPath, relPath);
    return isCountedFile(name) ? [relPath] : [];
  });

export const measure = (root) =>
  listFiles(join(root, WEB_SRC), WEB_SRC).flatMap((relPath) =>
    offendingLines(readFileSync(join(root, relPath), 'utf8')).map((line) => `${relPath}:${line}`),
  );

const selfTest = () => {
  const failures = [];
  const check = (condition, message) => {
    if (!condition) failures.push(message);
  };

  const source = [
    "path: '/api/v1/admin/users',",
    ' * `POST /api/v1/auth/login` — documentaire, rougit aussi',
    'path: adminEndpoints.users,',
    "const a = '/api/v1/x'; const b = '/api/v1/y';",
  ].join('\n');
  check(JSON.stringify(offendingLines(source)) === '[1,2,4]', `lignes 1, 2, 4 attendues, obtenu ${JSON.stringify(offendingLines(source))}.`);
  check(offendingLines('path: adminEndpoints.users,\n').length === 0, 'une entrée du catalogue ne doit pas rougir.');
  check(isCountedFile('admin.ts') && isCountedFile('page.tsx'), 'un .ts et un .tsx doivent être lus.');
  check(!isCountedFile('admin.test.ts') && !isCountedFile('page.test.tsx'), 'un fichier de test ne doit pas être lu.');
  check(!isCountedFile('notes.md') && !isCountedFile('style.css'), 'seuls .ts/.tsx sont lus.');

  if (failures.length > 0) {
    for (const failure of failures) console.error(`AVEUGLE : ${failure}`);
    return 1;
  }
  console.log('self-test : 5/5 vérifications passées (lecture, commentaires, entrée du catalogue, exclusion des tests).');
  return 0;
};

const main = () => {
  if (process.argv.includes('--self-test')) return selfTest();

  const offenders = measure(REPO_ROOT);
  if (offenders.length > 0) {
    console.error(`\n  ${offenders.length} ligne(s) de ${WEB_SRC} écrivent une adresse ${NEEDLE}… en dur :\n`);
    for (const at of offenders) console.error(`    · ${at}`);
    console.error(
      "\n  Un chemin d'API s'écrit dans le catalogue GÉNÉRÉ, jamais à la main : importer le module du groupe" +
        "\n  (`import * as adminEndpoints from '@meeshy/shared/api/endpoints/admin'`) et appeler son entrée," +
        "\n  qui encode ses paramètres. Dans un commentaire, citer l'entrée (`admin.usersByUserIdResetPassword`)." +
        '\n  Une route absente du catalogue se monte côté passerelle puis se régénère (#7716).\n',
    );
    return 1;
  }
  console.log(`  Aucune adresse ${NEEDLE}… écrite en dur dans ${WEB_SRC} : chaque chemin vient du catalogue généré.`);
  return 0;
};

process.exit(main());
