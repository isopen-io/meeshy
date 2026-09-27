#!/usr/bin/env node
// Cliquet des adresses d'API écrites en dur dans le web (#7716).
//
// LE DÉFAUT QU'IL FERME
//
// Un chemin d'API s'écrit à UN endroit : le catalogue GÉNÉRÉ depuis
// `services/gateway/route-manifest.json` (`packages/shared/api/endpoints.ts`
// et ses modules par groupe). `apps/web` écrivait les siens à la main,
// requête par requête (`path: '/api/v1/…'`) : une route renommée côté
// serveur ne faisait rougir ni le typage ni les tests du web, et le
// catalogue restait sans client (#7716, voie (a) décidée le 2026-09-27).
//
// CE QU'IL COMPTE
//
// Les LIGNES de `apps/web/src` (`.ts`, `.tsx`, hors `*.test.*`) qui
// contiennent `/api/v1/`, à toute profondeur. Le relevé de l'issue
// (`git grep -c "/api/v1/" -- 'apps/web/src/**/*.ts' … ':!*.test.*'`) en
// rendait 347 : son motif exige un sous-dossier sous `src/`, et manquait
// `src/main.tsx` — ce script compte aussi les fichiers de premier niveau.
// Un commentaire compte : une adresse recopiée dans un doc-comment se
// périme au premier renommage exactement comme celle d'un appel, et c'est
// l'entrée du catalogue qu'il faut y citer.
//
// Cliquet à DEUX sens, sur le modèle de `check-ts-catalog-dead-entries.mjs` :
// il rougit si le compte MONTE, et exige d'abaisser `BASELINE` quand il
// DESCEND. Quand la référence atteint 0, c'est une interdiction pure.
//
// --self-test : un monde synthétique prouve le comptage (commentaires
// compris, tests exclus), puis le cliquet à deux sens.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const WEB_SRC = 'apps/web/src';
const NEEDLE = '/api/v1/';
const TEST_FILE_RE = /\.test\.[^/]*$/;
const SOURCE_RE = /\.tsx?$/;

// 348 — mesuré le 2026-09-27 sur `origin/dev` (ba870370e3), avant la migration.
// 348 → 303 (#7716, lot admin).
// 303 → 287 (#7716, lot appels).
// 287 → 235 (#7716, lot authentification et compte).
// 235 → 191 (#7716, lot profil et annuaire).
// 191 → 138 (#7716, lot conversations et messages).
// 138 → 116 (#7716, lot liens).
// 116 → 50 (#7716, lot publications, stories et notifications).
// 50 → 0 (#7716, lot médias et infrastructure).
const BASELINE = 0;

export const isCountedFile = (name) => SOURCE_RE.test(name) && !TEST_FILE_RE.test(name);

export const countLiteralLines = (source) => source.split('\n').filter((line) => line.includes(NEEDLE)).length;

const listFiles = (absDir, relDir) =>
  readdirSync(absDir).flatMap((name) => {
    const absPath = join(absDir, name);
    const relPath = `${relDir}/${name}`;
    if (statSync(absPath).isDirectory()) return name === 'node_modules' ? [] : listFiles(absPath, relPath);
    return isCountedFile(name) ? [relPath] : [];
  });

export const measure = (root) =>
  listFiles(join(root, WEB_SRC), WEB_SRC)
    .map((relPath) => ({ relPath, count: countLiteralLines(readFileSync(join(root, relPath), 'utf8')) }))
    .filter(({ count }) => count > 0);

const RESULT = Object.freeze({ OK: 'ok', REGRESSION: 'regression', UNRECORDED_IMPROVEMENT: 'unrecorded-improvement' });

export const evaluateRatchet = (count, baseline) => {
  if (count > baseline) return RESULT.REGRESSION;
  if (count < baseline) return RESULT.UNRECORDED_IMPROVEMENT;
  return RESULT.OK;
};

const selfTest = () => {
  const failures = [];
  const check = (condition, message) => {
    if (!condition) failures.push(message);
  };

  const source = [
    "path: '/api/v1/admin/users',",
    ' * `POST /api/v1/auth/login` — documentaire, compte aussi',
    "path: adminEndpoints.users,",
    "const a = '/api/v1/x'; const b = '/api/v1/y';",
  ].join('\n');
  check(countLiteralLines(source) === 3, `comptage : 3 lignes attendues, obtenu ${countLiteralLines(source)}.`);
  check(isCountedFile('admin.ts') && isCountedFile('page.tsx'), 'un .ts et un .tsx doivent être comptés.');
  check(!isCountedFile('admin.test.ts') && !isCountedFile('page.test.tsx'), 'un fichier de test ne doit pas être compté.');
  check(!isCountedFile('notes.md') && !isCountedFile('style.css'), 'seuls .ts/.tsx sont comptés.');
  check(evaluateRatchet(2, 2) === RESULT.OK, 'un compte égal à la référence doit être OK.');
  check(evaluateRatchet(3, 2) === RESULT.REGRESSION, 'une hausse doit être une régression.');
  check(evaluateRatchet(1, 2) === RESULT.UNRECORDED_IMPROVEMENT, 'une baisse non enregistrée doit rougir.');
  check(evaluateRatchet(0, 0) === RESULT.OK && evaluateRatchet(1, 0) === RESULT.REGRESSION, 'à référence 0, une seule ligne rougit.');

  if (failures.length > 0) {
    for (const failure of failures) console.error(`AVEUGLE : ${failure}`);
    return 1;
  }
  console.log('self-test : 8/8 vérifications passées (comptage, commentaires, exclusion des tests, cliquet à deux sens).');
  return 0;
};

const main = () => {
  if (process.argv.includes('--self-test')) return selfTest();

  const offenders = measure(REPO_ROOT);
  const total = offenders.reduce((sum, { count }) => sum + count, 0);
  const verdict = evaluateRatchet(total, BASELINE);

  if (verdict === RESULT.REGRESSION) {
    console.error(`\n  ${total} ligne(s) de ${WEB_SRC} écrivent une adresse ${NEEDLE}… en dur (référence : ${BASELINE}).\n`);
    for (const { relPath, count } of offenders.sort((a, b) => b.count - a.count)) console.error(`    ${count}\t${relPath}`);
    console.error(
      "\n  Un chemin d'API s'écrit dans le catalogue GÉNÉRÉ (`@meeshy/shared/api/endpoints/<groupe>`), jamais à la main :" +
        "\n  importer le module du groupe (`import * as adminEndpoints from '@meeshy/shared/api/endpoints/admin'`) et" +
        "\n  appeler son entrée. Dans un commentaire, citer l'entrée du catalogue plutôt que l'adresse (#7716).\n",
    );
    return 1;
  }
  if (verdict === RESULT.UNRECORDED_IMPROVEMENT) {
    console.error(
      `\n  ${total} ligne(s) portent encore une adresse ${NEEDLE}… — moins que la référence (${BASELINE}).` +
        `\n  Abaisser BASELINE à ${total} dans scripts/check-web-api-literals.mjs : un progrès non enregistré se reperd en silence.\n`,
    );
    return 1;
  }
  console.log(
    total === 0
      ? `  Aucune adresse ${NEEDLE}… écrite en dur dans ${WEB_SRC} : chaque chemin vient du catalogue généré.`
      : `  ${total} ligne(s) de ${WEB_SRC} écrivent encore une adresse ${NEEDLE}… (référence ${BASELINE}, #7716).`,
  );
  return 0;
};

process.exit(main());
