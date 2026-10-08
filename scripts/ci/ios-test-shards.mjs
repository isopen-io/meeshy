#!/usr/bin/env node
// Tranches des suites XCTest iOS [#9692]
//
// Deux suites tenaient chacune dans UN job macOS et en ont crevé le plafond :
// MeeshyTests (`ios.yml`, > 75 min, run 37760716985) et le paquet MeeshySDK
// (`sdk-tests.yml`, coupé à 60 min, run 37772766998). Chacune bâtit désormais
// une fois, puis exécute ses tests en N tranches parallèles. Ce script décide
// QUELLES classes vont dans QUELLE tranche, sans macOS : il lit les sources
// Swift, il n'exécute rien.
//
// Répartition :
//   - une classe = une sous-classe directe de `XCTestCase` (mesuré : aucune
//     base de test intermédiaire dans les deux arbres) ;
//   - son poids = sa durée MESURÉE (`scripts/ci/test-timings/<suite>.json`,
//     tiré des xcresult des tranches) quand elle est connue, sinon son nombre
//     de `func test…()` × la durée médiane d'un test ;
//   - glouton du plus lourd au plus léger, chaque classe va à la tranche la
//     plus légère (égalité ⇒ plus petit indice), égalité de poids ⇒ ordre
//     alphabétique : la même arborescence donne toujours la même répartition ;
//   - la DERNIÈRE tranche est le RESTE : chaque cible entière moins les classes
//     des autres tranches. Ce que l'énumération ne voit pas — une déclaration
//     exotique, les tests Swift Testing (`@Test`) du SDK — y tourne quand même,
//     exactement une fois ; son poids estimé y est pré-chargé.
//
// Usage :
//   node scripts/ci/ios-test-shards.mjs --suite ios --matrix --shards 4 [--only A,B]
//   node scripts/ci/ios-test-shards.mjs --suite ios --args --shard 2 --shards 4 [--only A,B]
//   node scripts/ci/ios-test-shards.mjs --suite sdk --plan --shards 4
//   node scripts/ci/ios-test-shards.mjs --suite sdk --timings tests.json   (xcresulttool → durées)

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

export const SUITES = Object.freeze({
  ios: {
    targets: [{ name: 'MeeshyTests', dir: 'apps/ios/MeeshyTests', excludesFrom: 'apps/ios/project.yml' }],
    // Exclues de TOUTE exécution CI (cf. ios.yml, étape « Run iOS tests ») :
    // benchmarks XCTMetric et écritures réelles dans la photothèque.
    skipped: [
      'MessageListPerformanceTests',
      'BubbleSimpleMessagePerfTests',
      'SearchPerformanceTests',
      'CameraCaptureSaveRuntimeTests',
    ],
  },
  sdk: {
    targets: [
      { name: 'MeeshySDKTests', dir: 'packages/MeeshySDK/Tests/MeeshySDKTests' },
      { name: 'MeeshyUITests', dir: 'packages/MeeshySDK/Tests/MeeshyUITests' },
    ],
    skipped: [],
  },
});

export const ALWAYS_SKIPPED = Object.freeze([...SUITES.ios.skipped]);

const UNENUMERATED = '*';
const SUITE_NAME = /^(?:[A-Za-z0-9_]+\/)?[A-Za-z0-9_]+$/;
const TEST_CLASS =
  /^(?:@\w+(?:\([^)]*\))?\s+)*(?:(?:public|internal|private|fileprivate|open|final|nonisolated)\s+)*class\s+(\w+)\s*:\s*XCTestCase\b/;
const EXTENSION = /^(?:(?:public|internal|private|fileprivate)\s+)*extension\s+(\w+)\b/;
const OTHER_TOP_LEVEL =
  /^(?:@\w+(?:\([^)]*\))?\s+)*(?:(?:public|internal|private|fileprivate|open|final|nonisolated|indirect)\s+)*(?:class|struct|enum|actor|protocol)\s+\w+/;
const TEST_FUNC = /\bfunc\s+(test\w*)\s*\(\s*\)/g;
const SWIFT_TESTING = /^\s*@Test\b/gm;

/**
 * Énumère les classes XCTest d'une cible depuis une carte `chemin → source`.
 * Pur : le témoin l'alimente de fixtures. Rend aussi le nombre de `@Test`
 * (Swift Testing), que seule la tranche du reste exécute.
 */
export const enumerateTarget = (files) => {
  const sources = Object.values(files);
  const classes = new Set();
  for (const source of sources) {
    for (const line of source.split('\n')) {
      const match = TEST_CLASS.exec(line);
      if (match) classes.add(match[1]);
    }
  }
  const methods = new Map([...classes].map((name) => [name, []]));
  for (const source of sources) {
    let owner = null;
    for (const line of source.split('\n')) {
      const declared = TEST_CLASS.exec(line);
      const extended = declared ? null : EXTENSION.exec(line);
      if (declared) owner = declared[1];
      else if (extended) owner = classes.has(extended[1]) ? extended[1] : null;
      else if (OTHER_TOP_LEVEL.test(line)) owner = null;
      if (owner === null) continue;
      for (const found of line.matchAll(TEST_FUNC)) methods.get(owner).push(found[1]);
    }
  }
  const swiftTesting = sources.reduce((sum, s) => sum + (s.match(SWIFT_TESTING)?.length ?? 0), 0);
  return {
    classes: [...methods.entries()]
      .map(([name, list]) => ({ name, tests: list.length, methods: [...new Set(list)].sort() }))
      .sort((a, b) => a.name.localeCompare(b.name, 'en')),
    swiftTesting,
  };
};

/** Compat : la forme mono-cible d'origine. */
export const enumerateClasses = (files) => enumerateTarget(files).classes;

/**
 * Poids de chaque classe : durée mesurée si connue, sinon tests × la durée
 * MOYENNE d'un test, prise hors des classes plus lentes que 60 s (une poignée
 * de suites d'export vidéo pèse des minutes : elles ne disent rien du test
 * ordinaire, et la médiane, elle, sous-estime une queue lourde). 1 s par test
 * sans aucune mesure.
 */
const OUTLIER_SECONDS = 60;
// Ce que coûte un test HORS de sa durée propre (lancement, setUp/tearDown,
// journal) : mesuré sur le run 37805027444, 2 628 s de tranches pour 1 299 s
// de durées de classes et 16 655 tests ⇒ ~0,08 s par test. Sans ce terme,
// la tranche qui ramasse les mille petites classes durerait le double.
const OVERHEAD_PER_TEST = 0.08;
// Swift Testing exécute ses `@Test` en parallèle dans le processus : 1 536
// tests en 4 s mesurés (run 37805032390).
const SWIFT_TESTING_SECONDS = 0.01;
export const weigh = (targets, timings = {}) => {
  const measured = targets.flatMap((t) =>
    t.classes
      .map((c) => ({ tests: c.tests, seconds: timings[`${t.name}/${c.name}`] }))
      .filter((m) => m.tests > 0 && m.seconds !== undefined && m.seconds < OUTLIER_SECONDS),
  );
  const measuredTests = measured.reduce((sum, m) => sum + m.tests, 0);
  const perTest = measuredTests ? measured.reduce((sum, m) => sum + m.seconds, 0) / measuredTests : 1;
  const classes = targets.flatMap((t) =>
    t.classes.map((c) => {
      const id = `${t.name}/${c.name}`;
      const own = timings[id] ?? c.tests * perTest;
      return { id, name: c.name, tests: c.tests, methods: c.methods ?? [], weight: own + c.tests * OVERHEAD_PER_TEST };
    }),
  );
  const remainder = targets.reduce(
    (sum, t) => sum + (timings[`${t.name}/${UNENUMERATED}`] ?? t.swiftTesting * SWIFT_TESTING_SECONDS),
    0,
  );
  return { classes, remainder };
};

/**
 * Une classe qui pèse à elle seule plus de la moitié d'une tranche idéale
 * (les suites d'export vidéo du SDK : 9 à 11 min pour cinq tests) se découpe
 * en ses MÉTHODES (`Cible/Classe/test…`), chacune portant sa part du poids :
 * sans cela, la tranche qui la reçoit dure au moins ce que dure la classe.
 */
export const splitHeavy = (classes, count, remainder = 0) => {
  const total = classes.reduce((sum, c) => sum + c.weight, remainder);
  const limit = total / count / 2;
  return classes.flatMap((c) =>
    c.weight > limit && c.methods.length > 1
      ? c.methods.map((m) => ({ id: `${c.id}/${m}`, name: m, tests: 1, methods: [], weight: c.weight / c.methods.length }))
      : [c],
  );
};

/** Glouton LPT déterministe ; `preload` charge la dernière tranche (le reste). */
export const partition = (classes, count, preload = 0) => {
  if (!Number.isInteger(count) || count < 1) throw new Error(`nombre de tranches invalide : ${count}`);
  const weightOf = (c) => c.weight ?? c.tests;
  const ordered = [...classes].sort(
    (a, b) => weightOf(b) - weightOf(a) || (a.id ?? a.name).localeCompare(b.id ?? b.name, 'en'),
  );
  const shards = Array.from({ length: count }, (_, i) => ({
    index: i + 1,
    classes: [],
    tests: 0,
    weight: i === count - 1 ? preload : 0,
  }));
  for (const entry of ordered) {
    const lightest = shards.reduce((best, shard) => (shard.weight < best.weight ? shard : best));
    lightest.classes.push(entry.id ?? entry.name);
    lightest.tests += entry.tests;
    lightest.weight += weightOf(entry);
  }
  for (const shard of shards) {
    shard.classes.sort((a, b) => a.localeCompare(b, 'en'));
    shard.weight = Math.round(shard.weight);
  }
  return shards;
};

/** Une classe non attribuée, ou attribuée deux fois, est une faute. */
export const assertCovers = (ids, shards) => {
  const seen = new Map();
  for (const shard of shards) {
    for (const id of shard.classes) seen.set(id, (seen.get(id) ?? 0) + 1);
  }
  const known = new Set(ids);
  const missing = ids.filter((id) => !seen.has(id));
  const doubled = [...seen.entries()].filter(([, n]) => n > 1).map(([id]) => id);
  const foreign = [...seen.keys()].filter((id) => !known.has(id));
  if (missing.length || doubled.length || foreign.length) {
    throw new Error(
      `répartition fautive — absentes : ${missing.join(',') || '∅'} ; doublées : ${doubled.join(',') || '∅'} ; inconnues : ${foreign.join(',') || '∅'}`,
    );
  }
};

/**
 * `only` : noms séparés par des virgules. Un nom nu se rattache à la cible
 * qui déclare la classe (ou à la première cible si aucune ne la déclare).
 */
export const parseOnly = (only, targets) => {
  const suites = (only ?? '')
    .split(',')
    .map((s) => s.replace(/\s+/g, ''))
    .filter(Boolean);
  const invalid = suites.filter((s) => !SUITE_NAME.test(s));
  if (invalid.length) throw new Error(`suite invalide : ${invalid.join(', ')}`);
  return suites.map((s) => {
    if (s.includes('/')) return s;
    const owner = targets.find((t) => t.classes.some((c) => c.name === s)) ?? targets[0];
    return `${owner.name}/${s}`;
  });
};

/**
 * Le plan : `only` non vide ⇒ UNE tranche avec ces suites ; sinon `count`
 * tranches, la dernière étant le reste.
 */
export const plan = ({ targets, count, only = '', skipped = [], timings = {} }) => {
  const suites = parseOnly(only, targets);
  const targetNames = targets.map((t) => t.name);
  if (suites.length) {
    return { mode: 'only', targets: targetNames, shards: [{ index: 1, classes: suites, tests: null, weight: null }] };
  }
  const runnableTargets = targets.map((t) => ({
    ...t,
    classes: t.classes.filter((c) => !skipped.includes(c.name)),
  }));
  const weighed = weigh(runnableTargets, timings);
  const classes = splitHeavy(weighed.classes, count, weighed.remainder);
  const remainder = weighed.remainder;
  const shards = partition(classes, count, remainder);
  assertCovers(
    classes.map((c) => c.id),
    shards,
  );
  return { mode: 'full', targets: targetNames, shards };
};

/** Arguments xcodebuild de sélection pour la tranche `index` (1-based). */
export const selectionArgs = (built, index) => {
  const shard = built.shards[index - 1];
  if (!shard) throw new Error(`tranche ${index} absente (${built.shards.length} tranche(s))`);
  const whole = built.targets.map((t) => `-only-testing:${t}`);
  if (built.mode === 'full' && built.shards.length === 1) return whole;
  const isRemainder = built.mode === 'full' && index === built.shards.length;
  if (!isRemainder) return shard.classes.map((id) => `-only-testing:${id}`);
  const others = built.shards.slice(0, -1).flatMap((s) => s.classes);
  return [...whole, ...others.map((id) => `-skip-testing:${id}`)];
};

/** Les `.swift` exclus de la cible MeeshyTests par `project.yml` (chemins littéraux). */
export const projectExcludes = (projectYml, target = 'MeeshyTests') => {
  const lines = projectYml.split('\n');
  const start = lines.findIndex((l) => l.trimEnd() === `  ${target}:`);
  if (start < 0) return [];
  const end = lines.findIndex((l, i) => i > start && /^ {2}\S/.test(l));
  return lines
    .slice(start, end < 0 ? lines.length : end)
    .map((l) => /^\s*-\s*"([^"*]+\.swift)"\s*$/.exec(l)?.[1])
    .filter(Boolean);
};

/**
 * Durées par classe depuis `xcrun xcresulttool get test-results tests` :
 * `{ "Cible/Classe": secondes }`. Ce qui n'est pas une classe XCTest connue
 * (suites Swift Testing, fonctions `@Test` libres) s'additionne sous
 * `Cible/*`, le poids de la tranche du reste.
 */
export const timingsFromTests = (testsJson, targets) => {
  const known = new Map(targets.map((t) => [t.name, new Set(t.classes.map((c) => c.name))]));
  const seconds = (node) => {
    if (typeof node.durationInSeconds === 'number') return node.durationInSeconds;
    const parsed = /^([\d.]+)\s*s$/.exec(node.duration ?? '');
    if (parsed) return Number(parsed[1]);
    return (node.children ?? []).reduce((sum, child) => sum + seconds(child), 0);
  };
  const out = {};
  const add = (key, value) => {
    out[key] = Math.round(((out[key] ?? 0) + value) * 10) / 10;
  };
  const visit = (node) => {
    const classes = known.get(node.name);
    if (node.nodeType === 'Unit test bundle' && classes) {
      for (const child of node.children ?? []) {
        add(classes.has(child.name) ? `${node.name}/${child.name}` : `${node.name}/${UNENUMERATED}`, seconds(child));
      }
      return;
    }
    for (const child of node.children ?? []) visit(child);
  };
  for (const node of testsJson.testNodes ?? []) visit(node);
  return out;
};

/**
 * Durées par classe depuis le journal VERBEUX de xcodebuild (sans `-quiet`) :
 * chaque `Test Suite 'Classe' passed|failed` est suivi de
 * `Executed N tests … in A (B) seconds`. Sert quand le xcresult manque ou
 * qu'un délai a coupé la tranche (le journal, lui, est complet jusque-là).
 */
export const timingsFromLog = (log, targets) => {
  const known = new Map(targets.map((t) => [t.name, new Set(t.classes.map((c) => c.name))]));
  const out = {};
  let bundle = null;
  let pending = null;
  for (const line of log.split('\n')) {
    const started = /^Test Suite '([A-Za-z0-9_]+)\.xctest' started/.exec(line);
    if (started) bundle = known.has(started[1]) ? started[1] : null;
    const ended = /^Test Suite '([A-Za-z0-9_]+)' (?:passed|failed) at/.exec(line);
    if (ended) {
      pending = ended[1];
      continue;
    }
    const executed = /Executed \d+ tests?.* in [\d.]+ \(([\d.]+)\) seconds/.exec(line);
    if (executed && pending && bundle && known.get(bundle).has(pending)) {
      out[`${bundle}/${pending}`] = Math.round(Number(executed[1]) * 10) / 10;
    }
    pending = null;
  }
  return out;
};

const walk = (dir) =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : path.endsWith('.swift') ? [path] : [];
  });

export const readTargets = (repoRoot, suite) => {
  const config = SUITES[suite];
  if (!config) throw new Error(`suite inconnue : ${suite}`);
  return config.targets.map((target) => {
    const root = join(repoRoot, target.dir);
    const excluded = new Set(
      target.excludesFrom ? projectExcludes(readFileSync(join(repoRoot, target.excludesFrom), 'utf8'), target.name) : [],
    );
    const files = Object.fromEntries(
      walk(root)
        .map((path) => [relative(root, path), path])
        .filter(([rel]) => !excluded.has(rel))
        .map(([rel, path]) => [rel, readFileSync(path, 'utf8')]),
    );
    return { name: target.name, ...enumerateTarget(files) };
  });
};

/** Compat : les classes de MeeshyTests. */
export const readRepoClasses = (repoRoot) => readTargets(repoRoot, 'ios')[0].classes;

export const readTimings = (repoRoot, suite) => {
  const path = join(repoRoot, 'scripts/ci/test-timings', `${suite}.json`);
  return existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : {};
};

const flag = (argv, name) => {
  const at = argv.indexOf(name);
  return at < 0 ? undefined : argv[at + 1];
};

const main = (argv) => {
  const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '../..');
  const suite = flag(argv, '--suite') ?? 'ios';
  const targets = readTargets(repoRoot, suite);
  const logSource = flag(argv, '--timings-log');
  if (logSource) {
    process.stdout.write(`${JSON.stringify(timingsFromLog(readFileSync(logSource, 'utf8'), targets))}\n`);
    return;
  }
  const timingsSource = flag(argv, '--timings');
  if (timingsSource) {
    process.stdout.write(`${JSON.stringify(timingsFromTests(JSON.parse(readFileSync(timingsSource, 'utf8')), targets))}\n`);
    return;
  }
  const built = plan({
    targets,
    count: Number(flag(argv, '--shards') ?? '4'),
    only: flag(argv, '--only') ?? '',
    skipped: SUITES[suite].skipped,
    timings: readTimings(repoRoot, suite),
  });
  if (argv.includes('--matrix')) {
    process.stdout.write(`${JSON.stringify(built.shards.map((s) => s.index))}\n`);
    return;
  }
  if (argv.includes('--args')) {
    process.stdout.write(`${selectionArgs(built, Number(flag(argv, '--shard'))).join('\n')}\n`);
    return;
  }
  for (const shard of built.shards) {
    process.stdout.write(
      `tranche ${shard.index} : ${shard.classes.length} classe(s), ${shard.tests ?? '?'} test(s), poids ${shard.weight ?? '?'}\n`,
    );
  }
};

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`::error title=Tranches de tests iOS::${error.message}\n`);
    process.exit(1);
  }
}
