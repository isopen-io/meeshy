#!/usr/bin/env node
// Cohérence manifestes ↔ lockfiles — garde de dépôt (issue #4397)
//
// Échoue (exit 1) si un paquet gouverné est résolu d'une façon que les
// manifestes ne déclarent pas, s'il est résolu DEUX fois, si les deux
// lockfiles du dépôt ne disent pas la même chose, ou si le harnais de
// `tests/` lance une commande qui ne peut pas s'exécuter.
//
// ── POURQUOI CE FICHIER EXISTE, ET POURQUOI ICI ────────────────────────────
//
// L'invariant porte sur le DÉPÔT ENTIER : les deux lockfiles racine, les
// manifestes de `apps/*`, `services/*`, `packages/*`, et le harnais de
// `tests/`. Il ne rend aucune surface. Il ne peut donc pas vivre dans la
// suite jsdom d'une application — la première version de ce témoin le
// faisait, avec un `join(__dirname, '..', '..', '..')` à trois crans, dans
// un répertoire (`apps/web-v3`) destiné à être renommé au lot L8. La racine
// du dépôt est résolue par `git rev-parse --show-toplevel`, jamais par un
// compte de `..`.
//
// ── LES DEUX LOCKFILES ─────────────────────────────────────────────────────
//
// Ce dépôt en a DEUX, et les deux sont opérationnels : `apps/web/Dockerfile`
// construit l'image de production par `bun install --no-save` OU par
// `pnpm install --no-frozen-lockfile` selon une branche, et `ci.yml` lance
// les deux dans chaque job. Une garde qui n'en lit qu'un rend vert un dépôt
// divergent — c'est PIRE que pas de garde.
//
// La divergence n'est pas théorique : elle a eu lieu. Le champ npm
// `overrides` de la racine pinait `react` à `19.2.7` ; bun l'honore, pnpm ne
// le lit pas (il ne lit que `pnpm.overrides`, alors absent). Selon le
// gestionnaire qui construisait, l'app VIVE tournait sur deux React
// différents. D'où l'invariant 5 : `overrides` et `pnpm.overrides` sont un
// MIROIR, vérifié clé par clé.
//
// ── POURQUOI « SATISFAIT », ET PAS « ÉGALE LE PLANCHER » ───────────────────
//
// Le critère de fin de #4397 dit « une résolution UNIQUE cohérente avec les
// manifestes ». « Cohérente » est la satisfaction semver, pas l'égalité au
// plancher : un `^19.2.8` DÉCLARE accepter tout 19.x ≥ 19.2.8. Une garde qui
// exigerait l'égalité rougirait au premier patch amont, et le dépôt ne peut
// pas la satisfaire par ses propres canaux — Dependabot ne visite pas tous
// les manifestes concernés à la fois.
//
// La satisfaction n'est PAS un relâchement : une plage SANS caret (`19.2.8`,
// `15.5.23` — la forme des `overrides` et de `next`) n'est satisfaite que par
// l'égalité. La garde est donc exactement aussi stricte que ce que chaque
// manifeste DÉCLARE, ni plus ni moins. C'est ce qui attrape le défaut réel :
// `19.2.7` ne satisfait pas `^19.2.8`.
//
// Corollaire fail-closed : l'invariant 1 refuse toute plage qui n'est ni
// `X.Y.Z` ni `^X.Y.Z` sur un paquet gouverné. Une plage non supportée est
// une VIOLATION, jamais un silence.
//
// ── LA CHAÎNE, PAS SON PREMIER MAILLON ─────────────────────────────────────
//
// Le harnais de `tests/` ne compose plus les options du runner : il délègue à
// des scripts NOMMÉS (`bun run test:resilience`). Vérifier le harnais seul ne
// dit donc plus rien du fait que la commande démarre — un drapeau retiré peut
// avoir migré dans le manifeste APPELÉ. Mesuré : les quatre suites de
// `services/gateway` portaient encore `--testPathPattern=` et refusaient de
// démarrer sous Jest 30, pendant que le harnais réparé au-dessus avait l'air
// vivant. D'où l'invariant 6e, qui suit la délégation jusqu'au script exécuté.
//
// ── --self-test ────────────────────────────────────────────────────────────
//
// Exerce `violations()` — le mécanisme réel, pas une reimplémentation — contre
// onze dépôts-jouets : un sain (zéro violation), un par invariant, et deux qui
// FIGENT des faux positifs mesurés sur le dépôt réel (`@types/react` compté
// comme `react` ; `engines.pnpm` lu comme une invocation de pnpm).
// Une garde qui peut devenir aveugle sans le dire ne vaut rien.

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';

const GOVERNED_PACKAGES = ['react', 'react-dom', 'idb-keyval', '@playwright/test'];

const RESOLVING_FIELDS = ['dependencies', 'devDependencies', 'overrides'];

const WORKSPACE_ROOTS = ['apps', 'services', 'packages'];

const STANDALONE_MANIFESTS = ['package.json', 'tests/package.json'];

const HARNESS_FILES = ['tests/playwright.config.ts', 'tests/run-status-tests.sh', 'tests/package.json'];

// Les répertoires où le harnais `cd` ne sont pas une liste tenue à la main :
// ce sont exactement les `../X` qu'il cite (6a) qui portent un manifeste,
// plus `tests/` lui-même. La même lecture nourrit donc 6a et 6d — une liste
// figée ici raterait le jour où le harnais entre ailleurs.
const HARNESS_HOME = 'tests/package.json';

// Options de CLI retirées par les runners que le harnais invoque.
// `--testPathPattern` a été renommé `--testPathPatterns` par Jest 30 : le
// laisser dans un script, c'est laisser un fichier qui A L'AIR réparé.
const RETIRED_CLI_OPTIONS = [['--testPathPattern=', 'renommé --testPathPatterns= par Jest 30']];

const FOREIGN_INVOCATIONS = [
  ['pnpm', /\bpnpm\s+[a-z]/],
  ['npm', /\bnpm\s+(?:run|exec|test|install|ci)\b/],
  ['yarn', /\byarn\s+[a-z]/],
];

const SIBLING_PATH = /\.\.\/[A-Za-z0-9_./-]+/g;

const SCRIPT_INVOCATION = /\b(?:bun|pnpm|npm|yarn)\s+run\s+([A-Za-z0-9:_-]+)/g;

const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'));

const readJsonc = (path) => JSON.parse(readFileSync(path, 'utf8').replace(/,(\s*[}\]])/g, '$1'));

export const repoRoot = () =>
  execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();

export const manifestPaths = (root) => {
  const inWorkspaces = WORKSPACE_ROOTS.filter((dir) => existsSync(join(root, dir))).flatMap((dir) =>
    readdirSync(join(root, dir), { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => `${dir}/${entry.name}/package.json`)
  );

  return [...STANDALONE_MANIFESTS, ...inWorkspaces].filter((path) => existsSync(join(root, path)));
};

export const declarationsOf = (root, packageName) =>
  manifestPaths(root).flatMap((manifest) => {
    const content = readJson(join(root, manifest));

    return RESOLVING_FIELDS.flatMap((field) => {
      const section = content[field];
      if (typeof section !== 'object' || section === null) return [];

      const range = section[packageName];
      return typeof range === 'string' ? [{ manifest, field, range }] : [];
    });
  });

// ── Lecture des lockfiles ──────────────────────────────────────────────────
// `bun.lock` est du JSONC : on le PARSE (virgules traînantes retirées) plutôt
// que de le regexper. Une copie imbriquée y apparaît comme une clé suffixée
// (`<hôte>/<paquet>`) dans la même carte `packages`.
//
// L'appartenance se lit sur le SPÉCIFICATEUR (`entry[0]`), jamais sur la
// forme de la clé : `@types/react` et `@floating-ui/react-dom` finissent tous
// deux par `/react`… sans être `react`. Mesuré — la première écriture de
// cette garde comptait 4 résolutions de `react` sur un dépôt sain.

const bunResolutions = (root, packageName) => {
  const lock = readJsonc(join(root, 'bun.lock'));
  const packages = lock.packages ?? {};

  return Object.entries(packages).flatMap(([key, entry]) => {
    const specifier = Array.isArray(entry) ? entry[0] : null;
    if (typeof specifier !== 'string' || !specifier.startsWith(`${packageName}@`)) return [];
    return [{ key, version: specifier.slice(packageName.length + 1) }];
  });
};

// `pnpm-lock.yaml` liste ses paquets sous `packages:` en clés
// `<nom>@<version>` (citées dès que le nom porte un `@`). On suit la section
// courante plutôt que de regexper le fichier entier : `snapshots:`,
// `importers:` et `overrides:` répètent les mêmes noms sous d'autres formes.
const pnpmResolutions = (root, packageName) => {
  const lines = readFileSync(join(root, 'pnpm-lock.yaml'), 'utf8').split('\n');
  const prefixes = [`  ${packageName}@`, `  '${packageName}@`];
  const found = new Map();
  let section = null;

  for (const line of lines) {
    const top = /^([A-Za-z]+):\s*$/.exec(line);
    if (top !== null) {
      section = top[1];
      continue;
    }
    if (section !== 'packages') continue;

    const prefix = prefixes.find((candidate) => line.startsWith(candidate));
    if (prefix === undefined) continue;

    const version = line.slice(prefix.length).replace(/['":].*$/, '');
    if (/^\d+\.\d+\.\d+/.test(version)) found.set(version, `${packageName}@${version}`);
  }

  return [...found].map(([version, key]) => ({ key, version }));
};

const LOCKFILES = [
  { file: 'bun.lock', resolutions: bunResolutions },
  { file: 'pnpm-lock.yaml', resolutions: pnpmResolutions },
];

// ── Satisfaction semver, sur les DEUX seules formes que l'invariant 1 laisse
// passer. Écrite ici plutôt qu'importée : cette garde tourne AVANT le
// `bun install` du job, sur un checkout sans `node_modules`.

const RANGE = /^(\^?)(\d+)\.(\d+)\.(\d+)$/;

const VERSION = /^(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/;

export const isSupportedRange = (range) => RANGE.test(range);

export const satisfies = (version, range) => {
  const parsedRange = RANGE.exec(range);
  const parsedVersion = VERSION.exec(version);
  if (parsedRange === null || parsedVersion === null) return false;

  // Une préversion (`1.2.3-rc.1`) ne satisfait aucune plage stable — semver.
  if (/[-]/.test(version)) return false;

  const [, caret, rMajor, rMinor, rPatch] = parsedRange;
  const [, vMajor, vMinor, vPatch] = parsedVersion;
  const floor = [Number(rMajor), Number(rMinor), Number(rPatch)];
  const actual = [Number(vMajor), Number(vMinor), Number(vPatch)];

  const atLeastFloor =
    actual[0] > floor[0] ||
    (actual[0] === floor[0] && (actual[1] > floor[1] || (actual[1] === floor[1] && actual[2] >= floor[2])));

  if (caret !== '^') return actual.every((part, index) => part === floor[index]);
  if (floor[0] > 0) return actual[0] === floor[0] && atLeastFloor;
  if (floor[1] > 0) return actual[0] === 0 && actual[1] === floor[1] && atLeastFloor;
  return actual.every((part, index) => part === floor[index]);
};

// ── Les six invariants ─────────────────────────────────────────────────────

const packageViolations = (root) =>
  GOVERNED_PACKAGES.flatMap((packageName) => {
    const declarations = declarationsOf(root, packageName);
    const found = [];

    if (declarations.length === 0) {
      return [`${packageName} : gouverné mais déclaré par AUCUN manifeste — la garde serait aveugle`];
    }

    // 1. forme des plages (fail-closed)
    for (const { manifest, field, range } of declarations) {
      if (!isSupportedRange(range)) {
        found.push(
          `${packageName} : plage non supportée « ${range} » (${manifest} ${field}) — attendu X.Y.Z ou ^X.Y.Z`
        );
      }
    }
    if (found.length > 0) return found;

    const perLock = new Map();

    for (const { file, resolutions } of LOCKFILES) {
      const resolved = resolutions(root, packageName);

      // 2. unicité dans CHAQUE lockfile
      if (resolved.length !== 1) {
        found.push(
          `${packageName} : ${resolved.length} résolution(s) dans ${file} (${resolved.map((r) => r.key).join(', ') || 'aucune'}) — attendu une seule`
        );
        continue;
      }

      const [{ version }] = resolved;
      perLock.set(file, version);

      // 3. la résolution SATISFAIT chaque plage déclarée
      for (const { manifest, field, range } of declarations) {
        if (!satisfies(version, range)) {
          found.push(
            `${packageName} : ${file} résout ${version}, qui ne satisfait pas « ${range} » déclaré par ${manifest} ${field}`
          );
        }
      }
    }

    // 4. parité entre les deux lockfiles
    const versions = [...new Set(perLock.values())];
    if (perLock.size === LOCKFILES.length && versions.length > 1) {
      found.push(
        `${packageName} : les lockfiles divergent — ${[...perLock].map(([file, version]) => `${file} ⇒ ${version}`).join(', ')}`
      );
    }

    return found;
  });

const overrideMirrorViolations = (root) => {
  const manifest = readJson(join(root, 'package.json'));
  const npmOverrides = manifest.overrides ?? {};
  const pnpmOverrides = manifest.pnpm?.overrides ?? {};
  const keys = [...new Set([...Object.keys(npmOverrides), ...Object.keys(pnpmOverrides)])].sort();

  return keys.flatMap((key) => {
    const left = npmOverrides[key];
    const right = pnpmOverrides[key];
    if (left === right) return [];
    return [
      `overrides : « ${key} » vaut ${left ?? 'ABSENT'} dans "overrides" et ${right ?? 'ABSENT'} dans "pnpm.overrides" — bun lit le premier, pnpm le second`,
    ];
  });
};

const harnessSiblings = (root) =>
  HARNESS_FILES.filter((file) => existsSync(join(root, file))).flatMap((file) => [
    ...new Set(readFileSync(join(root, file), 'utf8').match(SIBLING_PATH) ?? []),
  ]);

const harnessScriptHosts = (root) => [
  HARNESS_HOME,
  ...new Set(harnessSiblings(root).map((target) => join('tests', target, 'package.json'))),
];

const harnessScriptNames = (root) => {
  const names = new Set();
  for (const host of harnessScriptHosts(root)) {
    if (!existsSync(join(root, host))) continue;
    for (const name of Object.keys(readJson(join(root, host)).scripts ?? {})) names.add(name);
  }
  return names;
};

const harnessViolations = (root) => {
  const known = harnessScriptNames(root);
  const hosts = harnessScriptHosts(root).join(', ');

  return HARNESS_FILES.filter((file) => existsSync(join(root, file))).flatMap((file) => {
    const content = readFileSync(join(root, file), 'utf8');
    const found = [];

    // 6a. aucune commande lancée depuis un répertoire mort
    for (const target of new Set(content.match(SIBLING_PATH) ?? [])) {
      if (!existsSync(join(root, 'tests', target))) {
        found.push(`${file} : référence « ${target} », répertoire inexistant`);
      }
    }

    // 6b. aucune option de CLI retirée par le runner invoqué
    for (const [option, why] of RETIRED_CLI_OPTIONS) {
      if (content.includes(option)) found.push(`${file} : utilise « ${option} », ${why}`);
    }

    // 6c. UN seul gestionnaire de paquets dans le harnais.
    // Sur une INVOCATION, jamais sur une mention : `"engines": {"pnpm": ...}`
    // DÉCLARE une compatibilité, il ne lance rien.
    for (const [manager, pattern] of FOREIGN_INVOCATIONS) {
      if (pattern.test(content)) {
        found.push(`${file} : invoque « ${manager} » — le harnais passe par bun, deux chemins = deux résolutions`);
      }
    }

    // 6d. tout script invoqué existe
    for (const [, name] of content.matchAll(SCRIPT_INVOCATION)) {
      if (!known.has(name)) found.push(`${file} : lance « run ${name} », script absent de ${hosts}`);
    }

    return found;
  });
};

// 6e. La CHAÎNE, pas seulement son premier maillon.
//
// Le harnais ne compose plus les options du runner : il délègue à des scripts
// nommés (`bun run test:resilience`). Vérifier le harnais seul ne dit donc
// plus rien du fait que la commande démarre — le drapeau retiré a migré dans
// le manifeste APPELÉ. Mesuré : les quatre suites de `services/gateway`
// (`test:integration`, `test:e2ee`, `test:performance`, `test:resilience`)
// portaient encore `--testPathPattern=` et refusaient de démarrer sous Jest 30,
// pendant que le harnais réparé au-dessus avait l'air vivant.
const scriptHostViolations = (root) =>
  harnessScriptHosts(root)
    .filter((host) => existsSync(join(root, host)))
    .flatMap((host) => {
      const scripts = JSON.stringify(readJson(join(root, host)).scripts ?? {});

      return RETIRED_CLI_OPTIONS.filter(([option]) => scripts.includes(option)).map(
        ([option, why]) => `${host} : un script utilise « ${option} », ${why}`
      );
    });

export const violations = (root) => [
  ...new Set([
    ...packageViolations(root),
    ...overrideMirrorViolations(root),
    ...harnessViolations(root),
    ...scriptHostViolations(root),
  ]),
];

// ── Self-test ──────────────────────────────────────────────────────────────

const bunLockFor = (entries) =>
  JSON.stringify({ lockfileVersion: 1, workspaces: {}, packages: Object.fromEntries(entries) }, null, 2);

const pnpmLockFor = (specifiers) =>
  ['lockfileVersion: \'9.0\'', '', 'importers:', '', 'packages:', ...specifiers.map((s) => `  '${s}': {}`), ''].join('\n');

const HEALTHY = {
  'package.json': {
    name: 'fixture',
    devDependencies: { '@playwright/test': '^1.62.1' },
    pnpm: { overrides: { react: '19.2.8' } },
    overrides: { react: '19.2.8' },
  },
  'apps/web/package.json': {
    name: 'web',
    scripts: { dev: 'next dev' },
    dependencies: { react: '^19.2.8', 'react-dom': '^19.2.8', 'idb-keyval': '^6.2.2' },
  },
  // `engines.pnpm` DECLARE une compatibilite ; il ne lance rien. La premiere
  // ecriture de 6c le lisait comme une invocation et rougissait dessus.
  'tests/package.json': {
    name: 'tests',
    scripts: { test: './run-status-tests.sh all' },
    engines: { node: '>=20.0.0', pnpm: '>=8.0.0' },
  },
  'bun.lock': [
    ['react', ['react@19.2.8', '', {}, 'sha512-x']],
    ['react-dom', ['react-dom@19.2.8', '', {}, 'sha512-x']],
    ['idb-keyval', ['idb-keyval@6.3.0', '', {}, 'sha512-x']],
    ['@playwright/test', ['@playwright/test@1.62.1', '', {}, 'sha512-x']],
    // Deux SOSIES : leur cle finit par `/react` et `/react-dom` sans etre
    // le paquet gouverne. Ils ont fait compter 4 resolutions de `react` a la
    // premiere ecriture de cette garde, sur un depot sain.
    ['@types/react', ['@types/react@19.2.18', '', {}, 'sha512-x']],
    ['@floating-ui/react-dom', ['@floating-ui/react-dom@2.1.9', '', {}, 'sha512-x']],
  ],
  'pnpm-lock.yaml': ['react@19.2.8', 'react-dom@19.2.8', 'idb-keyval@6.3.0', '@playwright/test@1.62.1'],
  'tests/run-status-tests.sh': 'cd ../services/gateway\nbun run test -- --testPathPatterns="__tests__/unit"\n',
  'tests/playwright.config.ts': "command: 'cd ../apps/web && bun run dev'\n",
  dirs: ['services/gateway', 'apps/web'],
};

const writeFixture = (root, shape) => {
  for (const dir of [...shape.dirs, 'apps/web', 'tests']) mkdirSync(join(root, dir), { recursive: true });
  mkdirSync(join(root, 'services/gateway'), { recursive: true });
  writeFileSync(
    join(root, 'services/gateway/package.json'),
    JSON.stringify({
      name: 'gw',
      scripts: shape['services/gateway/scripts'] ?? {
        test: 'jest',
        'test:unit': 'jest',
        'test:resilience': "jest --testPathPatterns='resilience'",
        'test:coverage': 'jest --coverage',
      },
    })
  );

  for (const [path, value] of Object.entries(shape)) {
    if (path === 'dirs' || path === 'services/gateway/scripts') continue;
    mkdirSync(dirname(join(root, path)), { recursive: true });
    if (path === 'bun.lock') writeFileSync(join(root, path), bunLockFor(value));
    else if (path === 'pnpm-lock.yaml') writeFileSync(join(root, path), pnpmLockFor(value));
    else if (typeof value === 'string') writeFileSync(join(root, path), value);
    else writeFileSync(join(root, path), JSON.stringify(value, null, 2));
  }
};

const clone = (shape) => JSON.parse(JSON.stringify(shape));

const CASES = [
  ['dépôt sain', (s) => s, null],
  [
    'override sous le plancher déclaré (le défaut react 19.2.7)',
    (s) => {
      s['package.json'].overrides.react = '19.2.7';
      s['package.json'].pnpm.overrides.react = '19.2.7';
      s['bun.lock'][0][1][0] = 'react@19.2.7';
      s['pnpm-lock.yaml'][0] = 'react@19.2.7';
      return s;
    },
    'ne satisfait pas « ^19.2.8 »',
  ],
  [
    'double résolution dans bun.lock (le défaut @playwright/test)',
    (s) => {
      s['bun.lock'].push(['apps/web/@playwright/test', ['@playwright/test@1.59.1', '', {}, 'sha512-x']]);
      return s;
    },
    '2 résolution(s) dans bun.lock',
  ],
  [
    'les deux lockfiles divergent',
    (s) => {
      s['pnpm-lock.yaml'][2] = 'idb-keyval@6.2.2';
      return s;
    },
    'les lockfiles divergent',
  ],
  [
    'pnpm.overrides ne reflète plus overrides',
    (s) => {
      delete s['package.json'].pnpm.overrides.react;
      return s;
    },
    'dans "pnpm.overrides"',
  ],
  [
    'plage non supportée sur un paquet gouverné',
    (s) => {
      s['apps/web/package.json'].dependencies.react = '~19.2.8';
      return s;
    },
    'plage non supportée',
  ],
  [
    'harnais visant un répertoire mort',
    (s) => {
      s['tests/playwright.config.ts'] = "command: 'cd ../frontend && bun run dev'\n";
      return s;
    },
    'répertoire inexistant',
  ],
  [
    'harnais portant une option de CLI retirée',
    (s) => {
      s['tests/run-status-tests.sh'] = 'cd ../services/gateway\nbun run test -- --testPathPattern="x"\n';
      return s;
    },
    '--testPathPattern=',
  ],
  [
    'harnais à deux gestionnaires de paquets',
    (s) => {
      s['tests/run-status-tests.sh'] = 'cd ../services/gateway\npnpm test -- --testPathPatterns="x"\n';
      return s;
    },
    'deux chemins = deux résolutions',
  ],
  [
    'script APPELÉ portant une option de CLI retirée',
    (s) => {
      s['tests/run-status-tests.sh'] = 'cd ../services/gateway\nbun run test:resilience\n';
      s['services/gateway/scripts'] = { 'test:resilience': "jest --testPathPattern='resilience'" };
      return s;
    },
    'un script utilise « --testPathPattern= »',
  ],
  [
    'harnais lançant un script inexistant',
    (s) => {
      s['tests/run-status-tests.sh'] = 'cd ../services/gateway\nbun run test:qui-nexiste-pas\n';
      return s;
    },
    'script absent',
  ],
];

const selfTest = () => {
  const failures = [];

  for (const [label, mutate, expected] of CASES) {
    const dir = mkdtempSync(join(tmpdir(), 'lockfile-gate-'));
    try {
      writeFixture(dir, mutate(clone(HEALTHY)));
      const found = violations(dir);

      if (expected === null && found.length > 0) {
        failures.push(`self-test « ${label} » : attendu zéro violation, obtenu :\n    ${found.join('\n    ')}`);
      }
      if (expected !== null && !found.some((line) => line.includes(expected))) {
        failures.push(
          `self-test « ${label} » : la détection est CASSÉE — « ${expected} » n'apparaît pas dans :\n    ${found.join('\n    ') || '(aucune violation)'}`
        );
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }

  if (failures.length > 0) {
    console.error(`\x1b[0;31m✗ ${failures.length} cas de self-test en échec\x1b[0m`);
    for (const failure of failures) console.error(`  ${failure}`);
    process.exit(1);
  }

  console.log(`\x1b[0;32m✓ self-test : ${CASES.length} cas, détection vivante\x1b[0m`);
};

const main = () => {
  if (process.argv.includes('--self-test')) return selfTest();

  const root = repoRoot();
  const found = violations(root);

  if (found.length > 0) {
    console.error(`\x1b[0;31m✗ ${found.length} divergence(s) entre manifestes et lockfiles\x1b[0m`);
    for (const line of found) console.error(`  • ${line}`);
    process.exit(1);
  }

  console.log(
    `\x1b[0;32m✓ ${GOVERNED_PACKAGES.length} paquets gouvernés : résolution unique, cohérente avec les manifestes, identique dans bun.lock et pnpm-lock.yaml\x1b[0m`
  );
};

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) main();
