#!/usr/bin/env node
// Cliquet de dette du catalogue d'endpoints TypeScript (#5372, suite de #4889).
//
// LE DÉFAUT QU'IL FERME
//
// Même défaut que son jumeau Swift (`check-swift-catalog-dead-entries.mjs`),
// sur l'autre catalogue GÉNÉRÉ : `packages/shared/api/endpoints.ts` porte
// l'en-tête « GÉNÉRÉ, ne pas éditer à la main » et est régénéré depuis
// `services/gateway/route-manifest.json`
// (`cd packages/shared && npm run api-endpoints:generate`), protégé en plus
// par un cliquet de régénération
// (`packages/shared/api/__tests__/endpoints-manifest-ratchet.test.ts`) qui
// rougit à la moindre divergence avec une régénération fraîche. Un marqueur
// posé à la main sur une entrée serait donc écrasé OU rejeté par ce cliquet
// avant même la prochaine régénération — la dette « sans appelant » doit donc
// se garder à côté du catalogue, jamais dedans, exactement comme côté Swift.
//
// MÉTHODOLOGIE
//
// 1. `API_ENDPOINTS` est un objet à DEUX niveaux : `{ namespace: { entrée:
//    '/chemin' | (param) => `/chemin/${param}` } }`. Le fichier porte aussi
//    `API_PATH_TEMPLATES` (un tableau) et `API_PATH_METHODS` (un objet dont
//    les clés sont des chemins littéraux, pas des identifiants) — ce script
//    borne son analyse aux lignes de `export const API_ENDPOINTS = {` jusqu'à
//    son `}` fermant de premier niveau, pour ne jamais confondre les trois.
// 2. Un NAMESPACE est une ligne à 2 espaces d'indentation `nom: {` ; une
//    ENTRÉE est une ligne à 4 espaces `nom: ...,` sous le namespace courant.
//    Vérifié sur le fichier réel (2026-09-06) : les 444 entrées sont toutes
//    sur une seule ligne — aucune valeur (chaîne ou fonction fléchée) ne
//    s'étend sur plusieurs lignes — donc un parseur ligne à ligne suffit sans
//    compter les accolades.
// 3. Un APPELANT est une occurrence de `API_ENDPOINTS.namespace.entrée` (le
//    seul style observé dans tout le dépôt — vérifié par grep avant d'écrire
//    ce garde, aucune déstructuration `const { ns } = API_ENDPOINTS`) dans
//    l'arbre CLIENT (`apps/web`, `packages/shared` hors le fichier qui
//    déclare le catalogue), HORS répertoires `__tests__` et fichiers
//    `*.test.ts(x)` / `*.spec.ts(x)`.
// 4. Le compte de dette est le nombre d'entrées SANS AUCUNE occurrence ainsi
//    définie. Cliquet à DEUX SENS, comme `check-type-debt.sh` et son jumeau
//    Swift : régression si le compte DÉPASSE la référence, amélioration NON
//    ENREGISTRÉE si le compte baisse sans que la référence ne soit abaissée.
//
// COHÉRENCE AVEC #4889
//
// #4889 rapporte 444 entrées et 277 sans appelant — ce script mesure
// exactement les deux mêmes nombres. Ce n'est pas garanti par construction
// (son jumeau Swift diverge légèrement du comptage manuel de #4889, pour la
// raison écrite dans son propre en-tête) ; ici la méthodologie mécanique
// rejoint la mesure manuelle. La référence ci-dessous reste ancrée sur CE
// script, pas sur #4889 : c'est SA stabilité et son auto-test qui font
// foi pour la suite.
//
// --self-test : un monde synthétique (deux namespaces, quelques entrées, des
// appelants connus) prouve le comptage, puis le cliquet à deux sens, puis que
// le parseur sait borner l'objet API_ENDPOINTS sans déborder sur
// API_PATH_METHODS voisin (un faux négatif classique : compter des chemins
// littéraux comme des entrées de catalogue).

import { readFileSync, readdirSync, statSync, realpathSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const CATALOG_FILE = 'packages/shared/api/endpoints.ts';

const SEARCH_ROOTS = ['apps/web', 'packages/shared'];

const EXCLUDED_DIR_NAMES = new Set(['__tests__', 'node_modules', '.next', 'dist', 'test-results']);
const TEST_FILE_RE = /\.(test|spec)\.tsx?$/;

const NAMESPACE_RE = /^ {2}([A-Za-z0-9_]+): \{$/;
const NAMESPACE_CLOSE_RE = /^ {2}\},?$/;
const ENTRY_RE = /^ {4}([A-Za-z0-9_]+):/;

const listSourceFiles = (absRoot, relRoot) => {
  const out = [];
  const walk = (absDir, relDir) => {
    let names;
    try {
      names = readdirSync(absDir);
    } catch {
      return;
    }
    for (const name of names) {
      if (EXCLUDED_DIR_NAMES.has(name)) continue;
      const absPath = join(absDir, name);
      const relPath = relDir ? `${relDir}/${name}` : name;
      const st = statSync(absPath);
      if (st.isDirectory()) {
        walk(absPath, relPath);
      } else if ((name.endsWith('.ts') || name.endsWith('.tsx')) && !TEST_FILE_RE.test(name)) {
        out.push(relPath);
      }
    }
  };
  walk(absRoot, relRoot);
  return out;
};

// Isole le bloc `export const API_ENDPOINTS = { ... };` (ou `} as const;`) —
// jamais `API_PATH_TEMPLATES` ni `API_PATH_METHODS`, qui vivent plus loin dans
// le même fichier avec une forme différente (tableau, clés = chemins).
export const extractCatalogBlock = (source) => {
  const lines = source.split('\n');
  const startIndex = lines.findIndex((l) => l.startsWith('export const API_ENDPOINTS ='));
  if (startIndex === -1) return null;
  const endIndex = lines.findIndex((l, i) => i > startIndex && /^\}/.test(l));
  if (endIndex === -1) return null;
  return lines.slice(startIndex + 1, endIndex);
};

export const parseCatalogBlock = (blockLines) => {
  const namespaces = [];
  let current = null;
  for (const line of blockLines) {
    const nsMatch = line.match(NAMESPACE_RE);
    if (nsMatch) {
      current = { name: nsMatch[1], entries: [] };
      namespaces.push(current);
      continue;
    }
    if (NAMESPACE_CLOSE_RE.test(line)) {
      current = null;
      continue;
    }
    if (!current) continue;
    const entryMatch = line.match(ENTRY_RE);
    if (entryMatch) current.entries.push(entryMatch[1]);
  }
  return namespaces;
};

// La référence est ancrée sur CE script (voir méthodologie ci-dessus), pas sur
// le comptage manuel de #4889. Qui la baisse doit avoir mesuré une vraie
// baisse ; qui la relève documente ici pourquoi une entrée neuve est morte à
// la naissance.
//
// 277 → 276 (#5430) : `API_ENDPOINTS.admin.shareLinksByIdReveal` a reçu son
// premier appelant hors test — `apps/web/app/admin/share-links/page.tsx`,
// qui l'appelle désormais pour réparer les contrôles « Copier »/« Ouvrir ».
//
// 276 → 271 (#5424) : `cleanup`, `stats`, `userStatus`, `test` et `info` ont
// quitté le catalogue CLIENT — ce sont des routes d'EXPLOITATION admin-only
// (`OPERATIONAL_ONLY_ROUTES`, `packages/shared/api/build-catalog.ts`), jamais
// une fonctionnalité client incomplète. Elles restent servies (voir
// `services/gateway/route-manifest.json`), seule leur présence au catalogue
// GÉNÉRÉ a été retirée.
const BASELINE_DEAD_ENTRIES = 271;

export const readWorld = (root) => {
  const source = readFileSync(join(root, CATALOG_FILE), 'utf8');
  const block = extractCatalogBlock(source);
  if (!block) throw new Error(`${CATALOG_FILE} : bloc "export const API_ENDPOINTS = {" introuvable — le fichier a changé de forme.`);
  const namespaces = parseCatalogBlock(block);

  const searchFiles = SEARCH_ROOTS.flatMap((r) => listSourceFiles(join(root, r), r));

  const nsNames = namespaces.map((n) => n.name);
  const callSiteRe = new RegExp(`API_ENDPOINTS\\.(${nsNames.join('|')})\\.([A-Za-z_][A-Za-z0-9_]*)`, 'g');

  const usedPairs = new Set();
  for (const relPath of searchFiles) {
    if (relPath === CATALOG_FILE) continue; // hors fichier de déclaration
    const contents = readFileSync(join(root, relPath), 'utf8');
    for (const match of contents.matchAll(callSiteRe)) {
      usedPairs.add(`${match[1]}.${match[2]}`);
    }
  }

  return { namespaces, usedPairs };
};

export const deadEntries = (world) =>
  world.namespaces.flatMap((ns) =>
    ns.entries.filter((e) => !world.usedPairs.has(`${ns.name}.${e}`)).map((e) => `${ns.name}.${e}`),
  );

const RESULT = Object.freeze({ OK: 'ok', REGRESSION: 'regression', UNRECORDED_IMPROVEMENT: 'unrecorded-improvement' });

export const evaluateRatchet = (deadCount, baseline) => {
  if (deadCount > baseline) return RESULT.REGRESSION;
  if (deadCount < baseline) return RESULT.UNRECORDED_IMPROVEMENT;
  return RESULT.OK;
};

const selfTest = () => {
  const world = {
    namespaces: [
      { name: 'foo', entries: ['alive', 'dead1', 'dead2'] },
      { name: 'bar', entries: ['aliveToo'] },
    ],
    usedPairs: new Set(['foo.alive', 'bar.aliveToo']),
  };
  const dead = deadEntries(world);
  if (dead.length !== 2 || !dead.includes('foo.dead1') || !dead.includes('foo.dead2')) {
    console.error(`AVEUGLE : dead entries attendues [foo.dead1, foo.dead2], obtenu ${JSON.stringify(dead)}.`);
    return 1;
  }

  if (evaluateRatchet(2, 2) !== RESULT.OK) {
    console.error('AVEUGLE : un compte égal à la référence doit être OK.');
    return 1;
  }
  if (evaluateRatchet(3, 2) !== RESULT.REGRESSION) {
    console.error('AVEUGLE : une régression (+1 entrée morte) doit être détectée.');
    return 1;
  }
  if (evaluateRatchet(1, 2) !== RESULT.UNRECORDED_IMPROVEMENT) {
    console.error('AVEUGLE : une amélioration non enregistrée (-1) doit être détectée.');
    return 1;
  }

  // Le fragment ci-dessous imite la forme réelle : API_ENDPOINTS à deux
  // niveaux, suivi d'un API_PATH_METHODS voisin dont les clés sont des
  // chemins littéraux — un parseur qui déborderait du bloc compterait
  // '/some/path' comme un namespace.
  const fragment = [
    "export const API_ENDPOINTS = {",
    "  admin: {",
    "    dashboard: '/api/v1/admin/dashboard',",
    "    byId: (id: string) => `/api/v1/admin/${id}`,",
    "  },",
    "  auth: {",
    "    login: '/api/v1/auth/login',",
    "  },",
    "} as const;",
    "",
    "export const API_PATH_METHODS = {",
    "  '/api/v1/admin/dashboard': ['GET'],",
    "};",
  ].join('\n');
  const block = extractCatalogBlock(fragment);
  const namespaces = block ? parseCatalogBlock(block) : null;
  const flat = namespaces ? namespaces.flatMap((n) => n.entries.map((e) => `${n.name}.${e}`)) : [];
  const expected = ['admin.dashboard', 'admin.byId', 'auth.login'];
  if (!namespaces || flat.length !== 3 || !expected.every((e) => flat.includes(e))) {
    console.error(`AVEUGLE : le parseur doit lire exactement ${JSON.stringify(expected)}, obtenu ${JSON.stringify(flat)}.`);
    return 1;
  }

  console.log('self-test : 6/6 vérifications passées (comptage, cliquet à deux sens, bornage API_ENDPOINTS≠API_PATH_METHODS).');
  return 0;
};

const main = () => {
  if (process.argv.includes('--self-test')) return selfTest();

  const world = readWorld(REPO_ROOT);
  const dead = deadEntries(world).sort();
  const verdict = evaluateRatchet(dead.length, BASELINE_DEAD_ENTRIES);

  if (verdict === RESULT.OK) {
    console.log(
      `Catalogue TS : ${dead.length} entrée(s) sans appelant hors test, conforme à la référence (${BASELINE_DEAD_ENTRIES}).`,
    );
    return 0;
  }

  if (verdict === RESULT.REGRESSION) {
    const added = dead.length - BASELINE_DEAD_ENTRIES;
    console.error(
      `RÉGRESSION : ${dead.length} entrées de catalogue TS sans appelant hors test, ` +
        `${added} de plus que la référence (${BASELINE_DEAD_ENTRIES}).`,
    );
    console.error(
      'Une entrée qui a perdu son dernier appelant est une promesse que le code ne tient plus (#4889) : ' +
        'retirez-la, ou documentez pourquoi elle est prématurée et relevez BASELINE_DEAD_ENTRIES dans ce script.',
    );
    console.error(`Entrées mortes : ${dead.join(', ')}`);
    return 1;
  }

  console.error(
    `AMÉLIORATION NON ENREGISTRÉE : ${dead.length} entrées de catalogue TS sans appelant hors test, ` +
      `en dessous de la référence (${BASELINE_DEAD_ENTRIES}). Abaissez BASELINE_DEAD_ENTRIES à ${dead.length} dans ce script.`,
  );
  return 1;
};

if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) {
  process.exit(main());
}
