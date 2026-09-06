#!/usr/bin/env node
// Cliquet de dette du catalogue d'endpoints Swift (#5372, suite de #4889).
//
// LE DÉFAUT QU'IL FERME
//
// #4889 a mesuré qu'une entrée de catalogue client SANS APPELANT se compte
// comme un lecteur : un décideur qui cherche qui consomme un champ voit une
// déclaration `case foo(id: String)` dans `ConversationsEndpoint.swift` et
// GARDE, alors que rien ne l'appelle jamais. Le balayage mécanique de #4889 a
// trouvé 260 entrées Swift dans ce cas (sur 444 mesurées par ce script — la
// méthodologie de comptage diffère légèrement de celle de #4889, voir plus
// bas) — trop pour rester une classification ponctuelle : ce garde rend
// l'état visible en continu.
//
// CE QU'IL NE FAIT PAS
//
// Il ne classe AUCUNE entrée en « prématurée » ou « abandonnée » — c'est la
// décision produit de #4889/#5373, déjà instruite pour les cas connus. Il ne
// peut pas non plus MARQUER une entrée sans appelant : les fichiers de
// `Networking/Endpoints/` portent l'en-tête « GÉNÉRÉ — ne pas éditer à la
// main » et sont réécrits depuis `services/gateway/route-manifest.json`
// (`npm run ios-endpoints:generate`) — un commentaire posé à la main y serait
// écrasé au prochain régénération. Ce garde vit donc À CÔTÉ du catalogue,
// jamais dedans.
//
// MÉTHODOLOGIE
//
// 1. Chaque fichier de `Networking/Endpoints/*.swift` qui déclare
//    `public enum <Type>: MeeshyEndpoint` est un catalogue. Ses ENTRÉES sont
//    les cas DÉCLARÉS — `case foo` / `case foo(id: String)` — jamais les
//    branches du `switch self` qui calcule `path` : celles-ci s'écrivent
//    `case .foo(let id):`, avec un point, que le motif `^\s*case
//    [A-Za-z_]` ne peut pas matcher (un point n'est ni une lettre ni un tiret
//    bas). C'est cette asymétrie de syntaxe — jamais un exclude de plage de
//    lignes, fragile au moindre réagencement du fichier généré — qui sépare
//    la déclaration de son usage interne.
// 2. Un APPELANT est une occurrence de `TypeName.entryName` (le seul style
//    observé dans tout le dépôt : aucun site n'utilise le sucre `.entryName`
//    à type inféré pour ces catalogues — vérifié par grep avant d'écrire ce
//    garde) dans l'arbre CLIENT (SDK + app iOS + ses extensions), HORS :
//      - le fichier qui DÉCLARE ce type (une switch-arm ne compte jamais,
//        déjà exclue par le point ci-dessus, mais un doc-comment cité en
//        exemple dans le même fichier ne doit pas se compter lui-même) ;
//      - les répertoires de TESTS (`Tests/`, `MeeshyTests/`,
//        `MeeshyUIDeviceTests/`) — un appel qui n'existe que dans un test
//        n'est pas un lecteur de PRODUCTION, et c'est exactement le sens de
//        « hors test » dans #4889/#5372.
// 3. Le compte de dette est le nombre d'entrées SANS AUCUNE occurrence ainsi
//    définie. Un cliquet à DEUX SENS (miroir de `check-type-debt.sh`) : il
//    échoue si le compte DÉPASSE la référence enregistrée (régression — une
//    entrée de plus qu'on a cessé d'appeler sans le remarquer), et il échoue
//    aussi si le compte BAISSE sans que la référence ne soit abaissée dans le
//    MÊME commit (amélioration non enregistrée — le prochain qui régresse d'un
//    cran repasserait sous une référence perimée sans qu'aucun garde ne le
//    voie).
//
// POURQUOI LE COMPTE TOTAL DIFFÈRE DE #4889 (451 → 444 ici)
//
// #4889 rapporte 451 entrées, 260 sans appelant. Ce script en mesure 444. La
// méthodologie de #4889 n'est pas reproduite ligne à ligne dans cette issue —
// seul le RÉSULTAT y est cité — et une différence de 7 sur 451 (1,5 %) ne
// mérite pas une chasse rétroactive à l'algorithme exact d'une mesure
// manuelle. Ce qui compte pour un cliquet est que SA PROPRE mesure soit
// stable et auto-testée, pas qu'elle réplique au chiffre près un comptage
// dont la méthode précise n'est pas tracée. La référence ci-dessous est donc
// ancrée sur CE script, pas sur #4889.
//
// --self-test : construit un monde synthétique (deux types, quelques entrées,
// des appelants connus) et vérifie que le compte de dette qui en sort est
// EXACTEMENT celui attendu à la main — puis que le cliquet rougit sur une
// régression (+1 entrée morte) et sur une amélioration non enregistrée
// (-1 sans abaisser la référence). Un cliquet qui n'a jamais été vu échouer
// sur les deux formes de dérive n'est pas un garde (leçon de #5366/#4764).

import { readFileSync, readdirSync, statSync, realpathSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const CATALOG_DIR = 'packages/MeeshySDK/Sources/MeeshySDK/Networking/Endpoints';

const SEARCH_ROOTS = [
  'packages/MeeshySDK/Sources',
  'apps/ios/Meeshy',
  'apps/ios/MeeshyNotificationExtension',
  'apps/ios/MeeshyContextMenu',
  'apps/ios/MeeshyShareExtension',
  'apps/ios/MeeshyWidgets',
];

const EXCLUDED_DIR_NAMES = new Set(['Tests', 'MeeshyTests', 'MeeshyUIDeviceTests']);

// La référence est ancrée sur CE script (voir méthodologie ci-dessus), pas sur
// le comptage manuel de #4889. Qui la baisse doit avoir mesuré une vraie
// baisse ; qui la relève documente ici pourquoi une entrée neuve est morte à
// la naissance (une porte posée pour un écran à venir, cf. #4889).
const BASELINE_DEAD_ENTRIES = 250;

const CATALOG_ENUM_RE = /public enum ([A-Za-z0-9_]+)\s*:\s*MeeshyEndpoint\b/;
// Une déclaration de cas n'a jamais de point après `case` ; une branche de
// `switch self` en a toujours un (`case .foo(let x):`). C'est cette asymétrie
// de syntaxe qui distingue les deux, pas une position dans le fichier.
const CASE_DECL_RE = /^\s*case ([A-Za-z_][A-Za-z0-9_]*)/;
// Garde-fou contre un futur `case let .foo` (absent du dépôt aujourd'hui,
// vérifié par grep) : un mot-clé Swift ne peut pas être le nom d'un cas.
const SWIFT_KEYWORDS = new Set(['let', 'var', 'is', 'where', 'try']);

const listSwiftFiles = (absRoot, relRoot) => {
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
      } else if (name.endsWith('.swift')) {
        out.push(relPath);
      }
    }
  };
  walk(absRoot, relRoot);
  return out;
};

export const parseCatalogSource = (source) => {
  const typeMatch = source.match(CATALOG_ENUM_RE);
  if (!typeMatch) return null;
  const entries = [];
  for (const line of source.split('\n')) {
    const m = line.match(CASE_DECL_RE);
    if (m && !SWIFT_KEYWORDS.has(m[1])) entries.push(m[1]);
  }
  return { typeName: typeMatch[1], entries };
};

export const readWorld = (root) => {
  const catalogAbsDir = join(root, CATALOG_DIR);
  const catalogFiles = readdirSync(catalogAbsDir).filter((f) => f.endsWith('.swift'));

  const catalogs = [];
  for (const file of catalogFiles) {
    const relPath = `${CATALOG_DIR}/${file}`;
    const source = readFileSync(join(root, relPath), 'utf8');
    const parsed = parseCatalogSource(source);
    if (parsed) catalogs.push({ ...parsed, declaredIn: relPath });
  }

  const searchFiles = SEARCH_ROOTS.flatMap((r) => listSwiftFiles(join(root, r), r));

  // Une passe unique sur chaque fichier, une alternation sur les types connus
  // — jamais une regex par entrée : 444 passes sur ~800 fichiers serait le
  // même travail refait 444 fois pour la même réponse.
  const typeNames = catalogs.map((c) => c.typeName);
  const callSiteRe = new RegExp(`\\b(${typeNames.join('|')})\\.([A-Za-z_][A-Za-z0-9_]*)\\b`, 'g');

  const usedPairs = new Set();
  for (const relPath of searchFiles) {
    const source = readFileSync(join(root, relPath), 'utf8');
    for (const match of source.matchAll(callSiteRe)) {
      const [, typeName] = match;
      const declaredIn = catalogs.find((c) => c.typeName === typeName)?.declaredIn;
      if (relPath === declaredIn) continue; // hors fichier de déclaration
      usedPairs.add(`${match[1]}.${match[2]}`);
    }
  }

  return { catalogs, usedPairs };
};

export const deadEntries = (world) =>
  world.catalogs.flatMap((c) =>
    c.entries.filter((e) => !world.usedPairs.has(`${c.typeName}.${e}`)).map((e) => `${c.typeName}.${e}`),
  );

const RESULT = Object.freeze({ OK: 'ok', REGRESSION: 'regression', UNRECORDED_IMPROVEMENT: 'unrecorded-improvement' });

export const evaluateRatchet = (deadCount, baseline) => {
  if (deadCount > baseline) return RESULT.REGRESSION;
  if (deadCount < baseline) return RESULT.UNRECORDED_IMPROVEMENT;
  return RESULT.OK;
};

const selfTest = () => {
  const world = {
    catalogs: [
      { typeName: 'FooEndpoint', entries: ['alive', 'dead1', 'dead2'], declaredIn: 'Foo.swift' },
      { typeName: 'BarEndpoint', entries: ['aliveToo'], declaredIn: 'Bar.swift' },
    ],
    usedPairs: new Set(['FooEndpoint.alive', 'BarEndpoint.aliveToo']),
  };
  const dead = deadEntries(world);
  if (dead.length !== 2 || !dead.includes('FooEndpoint.dead1') || !dead.includes('FooEndpoint.dead2')) {
    console.error(`AVEUGLE : dead entries attendues [FooEndpoint.dead1, FooEndpoint.dead2], obtenu ${JSON.stringify(dead)}.`);
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

  // Vérifie aussi que le parseur ne confond pas déclaration et switch-arm sur
  // un fragment réel de la forme générée.
  const fragment = [
    'public enum SampleEndpoint: MeeshyEndpoint, Sendable {',
    '    case root',
    '    case byId(id: String)',
    '',
    '    public var path: String {',
    '        switch self {',
    '        case .root: return "/api/v1/sample"',
    '        case .byId(let id): return "/api/v1/sample/\\(id)"',
    '        }',
    '    }',
    '}',
  ].join('\n');
  const parsed = parseCatalogSource(fragment);
  if (!parsed || parsed.typeName !== 'SampleEndpoint' || parsed.entries.length !== 2 || !parsed.entries.includes('root') || !parsed.entries.includes('byId')) {
    console.error(`AVEUGLE : le parseur doit lire exactement [root, byId], obtenu ${JSON.stringify(parsed)}.`);
    return 1;
  }

  console.log('self-test : 6/6 vérifications passées (comptage, cliquet à deux sens, parseur déclaration≠switch-arm).');
  return 0;
};

const main = () => {
  if (process.argv.includes('--self-test')) return selfTest();

  const world = readWorld(REPO_ROOT);
  const dead = deadEntries(world).sort();
  const verdict = evaluateRatchet(dead.length, BASELINE_DEAD_ENTRIES);

  if (verdict === RESULT.OK) {
    console.log(
      `Catalogue Swift : ${dead.length} entrée(s) sans appelant hors test, conforme à la référence (${BASELINE_DEAD_ENTRIES}).`,
    );
    return 0;
  }

  if (verdict === RESULT.REGRESSION) {
    const added = dead.length - BASELINE_DEAD_ENTRIES;
    console.error(
      `RÉGRESSION : ${dead.length} entrées de catalogue Swift sans appelant hors test, ` +
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
    `AMÉLIORATION NON ENREGISTRÉE : ${dead.length} entrées de catalogue Swift sans appelant hors test, ` +
      `en dessous de la référence (${BASELINE_DEAD_ENTRIES}). Abaissez BASELINE_DEAD_ENTRIES à ${dead.length} dans ce script.`,
  );
  return 1;
};

if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) {
  process.exit(main());
}
