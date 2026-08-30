#!/usr/bin/env node
// Garde d'alignement bun.lock ↔ manifestes de workspace [L-0.5, issue #4397]
//
// POURQUOI IL VIT À LA RACINE, ET PAS DANS UN WORKSPACE
//
// L'invariant porte sur le `bun.lock` de la RACINE et sur TOUS les manifestes
// que la racine déclare comme workspaces. Sa surface est donc le dépôt, pas une
// app. Sa première écriture vivait dans `apps/web-v3/__tests__/` : elle sortait
// de son propre workspace (`join(__dirname,'..','..','..')`), ne tournait dans
// AUCUNE CI (`grep web-v3 .github/workflows/ci.yml` = rien), et serait morte en
// silence au premier renommage de `apps/web-v3`. Un garde d'infrastructure
// hébergé par l'app la plus jeune du dépôt. Précédent retenu :
// `scripts/check-type-debt.sh`, gate de racine appelé par le job `quality`.
//
// POURQUOI L'ENTRÉE EST CALCULÉE DEPUIS LES GLOBS, ET PAS PAR UN PARCOURS DISQUE
//
// Un parcours du disque ramassait `tests/package.json` — que la racine ne
// déclare dans aucun glob (`apps/*`, `services/*`, `packages/*`), dont bun ne
// connaît aucune entrée et qui n'a pas de `node_modules` — et
// `packages/shared/prisma/client/package.json`, un manifeste GÉNÉRÉ et
// GITIGNORÉ. L'entrée du garde variait donc selon qu'un `prisma generate` avait
// tourné, et il exigeait un alignement sur un manifeste que bun n'installe
// jamais. L'ensemble est désormais exactement le graphe que bun gouverne.
// Le sort de `tests/` — l'y faire entrer, ou le supprimer — est l'issue #4418.
//
// POURQUOI LES DEUX SENS SONT TESTÉS
//
// La première écriture itérait les workspaces que `bun.lock` connaît DÉJÀ, puis
// lisait leur manifeste. Un manifeste que le lock n'a jamais vu n'était donc
// contrôlé par personne — le sens « manifeste → lock », c'est-à-dire le sens
// que le critère de fin nomme. Ce n'était pas théorique : `apps/web-v3` était
// exactement dans cet état, et le garde certifiait « aligné ».
//
// Les deux sens ensemble ont un effet de bord voulu : un `bun.lock` commité
// SANS l'arbre de fichiers qu'il décrit (ou l'inverse) rougit. Le lock et le
// disque ne peuvent plus diverger sur un clone propre sans que la CI le dise.

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const DEPENDENCY_FIELDS = [
  'dependencies',
  'devDependencies',
  'peerDependencies',
  'optionalDependencies',
];

const INSTALLED_FIELDS = ['dependencies', 'devDependencies'];

const TRACKED_PACKAGES = ['react', 'react-dom', 'idb-keyval', '@playwright/test'];

// Épingles de `overrides` posées SOUS une portée qu'un workspace déclare. Les
// monter change ce qui est installé pour tous les consommateurs transitifs :
// c'est un bump de dépendances avec ses propres gates, pas un alignement de
// lock. La dette est donc DÉCLARÉE ici et gardée dans les deux sens — une
// entrée qui cesse de contredire ses manifestes fait rougir ce garde, pour que
// la liste ne pourrisse pas en amnistie permanente. Sa résorption est l'issue
// #4417 ; cette liste doit finir vide.
const OVERRIDES_LAGGING_BEHIND_THEIR_MANIFESTS = ['dompurify', 'postcss', 'uuid'];

const isRecord = (value) =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const rangesAt = (document, field) =>
  Object.fromEntries(
    Object.entries(isRecord(document?.[field]) ? document[field] : {}).filter(
      ([, range]) => typeof range === 'string',
    ),
  );

const JSON_STRING = /("(?:\\.|[^"\\])*")/;

const stripTrailingCommas = (source) =>
  source
    .split(JSON_STRING)
    .map((chunk, index) => (index % 2 === 1 ? chunk : chunk.replace(/,(\s*[}\]])/g, '$1')))
    .join('');

const readJson = (absolutePath, transform = (source) => source) => {
  const parsed = JSON.parse(transform(readFileSync(absolutePath, 'utf8')));
  if (!isRecord(parsed)) {
    throw new Error(`${absolutePath} n'est pas un objet JSON`);
  }
  return parsed;
};

const expandWorkspaceGlobs = (patterns, root) =>
  patterns.flatMap((pattern) => {
    const segments = pattern.split('/');
    const star = segments.indexOf('*');
    if (star === -1) {
      return existsSync(join(root, pattern, 'package.json')) ? [pattern] : [];
    }
    if (star !== segments.length - 1) {
      throw new Error(`motif de workspace non géré par ce garde : ${pattern}`);
    }
    const parent = segments.slice(0, -1).join('/');
    if (!existsSync(join(root, parent))) {
      return [];
    }
    return readdirSync(join(root, parent), { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => `${parent}/${entry.name}`)
      .filter((directory) => existsSync(join(root, directory, 'package.json')))
      .sort();
  });

const readWorld = (root) => {
  const rootManifest = readJson(join(root, 'package.json'));
  const patterns = Array.isArray(rootManifest.workspaces) ? rootManifest.workspaces : [];
  const manifests = [
    { directory: '', document: rootManifest },
    ...expandWorkspaceGlobs(patterns, root).map((directory) => ({
      directory,
      document: readJson(join(root, directory, 'package.json')),
    })),
  ];
  return { manifests, lock: readJson(join(root, 'bun.lock'), stripTrailingCommas) };
};

const manifestPathOf = (directory) =>
  directory === '' ? 'package.json' : `${directory}/package.json`;

const lockWorkspacesOf = (world) =>
  isRecord(world.lock.workspaces) ? world.lock.workspaces : {};

const lockPackagesOf = (world) => (isRecord(world.lock.packages) ? world.lock.packages : {});

const parseVersion = (version) => {
  const match = /^(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/.exec(version);
  return match === null ? null : [Number(match[1]), Number(match[2]), Number(match[3])];
};

const isAtLeast = (version, floor) =>
  version[0] !== floor[0]
    ? version[0] > floor[0]
    : version[1] !== floor[1]
      ? version[1] > floor[1]
      : version[2] >= floor[2];

const sharesTheCaretLine = (version, floor) =>
  floor[0] !== 0
    ? version[0] === floor[0]
    : floor[1] !== 0
      ? version[0] === 0 && version[1] === floor[1]
      : version[0] === 0 && version[1] === 0 && version[2] === floor[2];

const sharesTheTildeLine = (version, floor) =>
  version[0] === floor[0] && version[1] === floor[1];

// `null` = portée que ce garde ne sait pas comparer (`>=`, `*`, alias, URL).
// Elle est alors ignorée plutôt que de faire planter le garde : un verdict
// absent est honnête, un faux verdict ne l'est pas.
const satisfies = (version, range) => {
  const resolved = parseVersion(version);
  if (resolved === null) {
    return null;
  }
  if (range.startsWith('^') || range.startsWith('~')) {
    const floor = parseVersion(range.slice(1));
    if (floor === null) {
      return null;
    }
    const line = range.startsWith('^')
      ? sharesTheCaretLine(resolved, floor)
      : sharesTheTildeLine(resolved, floor);
    return line && isAtLeast(resolved, floor);
  }
  return /^\d/.test(range) ? range === version : null;
};

const isInstallableRange = (range) => !range.startsWith('workspace:');

const floorOf = (range) => (/^[\^~]/.test(range) ? range.slice(1) : range);

const resolvedVersionOf = (entry) => {
  const specifier = Array.isArray(entry) ? entry[0] : undefined;
  return typeof specifier === 'string'
    ? specifier.slice(specifier.lastIndexOf('@') + 1)
    : undefined;
};

const dependencyNameOf = (lockKey) => {
  const segments = lockKey.split('/');
  const last = segments[segments.length - 1] ?? lockKey;
  const beforeLast = segments[segments.length - 2];
  return beforeLast !== undefined && beforeLast.startsWith('@') ? `${beforeLast}/${last}` : last;
};

const isNestedKey = (lockKey) =>
  lockKey.split('/').length > (lockKey.startsWith('@') ? 2 : 1);

const versionsResolvedFor = (world, dependency) => {
  const packages = lockPackagesOf(world);
  const keys = Object.keys(packages).filter(
    (key) => key === dependency || (isNestedKey(key) && dependencyNameOf(key) === dependency),
  );
  return [...new Set(keys.map((key) => resolvedVersionOf(packages[key])))]
    .filter((version) => version !== undefined)
    .sort();
};

const declarationsOf = (world, dependency) =>
  world.manifests.flatMap(({ directory, document }) =>
    [...DEPENDENCY_FIELDS, 'overrides'].flatMap((field) => {
      const range = rangesAt(document, field)[dependency];
      return range === undefined
        ? []
        : [{ site: `${manifestPathOf(directory)} ${field}`, range }];
    }),
  );

const everyWorkspaceOnDiskIsLocked = (world) => {
  const locked = lockWorkspacesOf(world);
  return world.manifests
    .filter(({ directory }) => !(directory in locked))
    .map(
      ({ directory }) =>
        `manifeste de workspace absent de bun.lock : ${manifestPathOf(directory)} — le lock n'a jamais vu ce workspace`,
    );
};

const everyLockedWorkspaceIsOnDisk = (world) => {
  const onDisk = new Set(world.manifests.map(({ directory }) => directory));
  return Object.keys(lockWorkspacesOf(world))
    .filter((directory) => !onDisk.has(directory))
    .map(
      (directory) =>
        `bun.lock déclare un workspace absent du graphe sur disque : ${directory || '.'} — arbre de fichiers et lock ont divergé`,
    );
};

const pairedWorkspaces = (world) => {
  const locked = lockWorkspacesOf(world);
  return world.manifests
    .filter(({ directory }) => isRecord(locked[directory]))
    .map(({ directory, document }) => ({ directory, document, locked: locked[directory] }));
};

const lockRepeatsTheIdentityOfEachManifest = (world) =>
  pairedWorkspaces(world).flatMap(({ directory, document, locked }) =>
    ['name', 'version'].flatMap((field) =>
      document[field] === locked[field] ||
      document[field] === undefined ||
      locked[field] === undefined
        ? []
        : [
            `${manifestPathOf(directory)} ${field} : manifeste=${String(document[field])} lock=${String(locked[field] ?? '(absent)')}`,
          ],
    ),
  );

const lockRepeatsTheRangesOfEachManifest = (world) =>
  pairedWorkspaces(world).flatMap(({ directory, document, locked }) =>
    DEPENDENCY_FIELDS.flatMap((field) => {
      const declared = rangesAt(document, field);
      const inLock = rangesAt(locked, field);
      return [...new Set([...Object.keys(declared), ...Object.keys(inLock)])]
        .filter((name) => declared[name] !== inLock[name])
        .map(
          (name) =>
            `${manifestPathOf(directory)} ${field} ${name} : manifeste=${declared[name] ?? '(absent)'} lock=${inLock[name] ?? '(absent)'}`,
        );
    }),
  );

const rootOverridesOf = (world) => {
  const root = world.manifests.find(({ directory }) => directory === '');
  return root === undefined ? {} : rangesAt(root.document, 'overrides');
};

const lockRepeatsTheOverridesOfTheRoot = (world) => {
  const declared = rootOverridesOf(world);
  const inLock = rangesAt(world.lock, 'overrides');
  return [...new Set([...Object.keys(declared), ...Object.keys(inLock)])]
    .filter((name) => declared[name] !== inLock[name])
    .map(
      (name) =>
        `overrides ${name} : package.json=${declared[name] ?? '(absent)'} bun.lock=${inLock[name] ?? '(absent)'}`,
    );
};

const resolutionKeyFor = (world, workspaceName, dependency) => {
  const packages = lockPackagesOf(world);
  return [`${workspaceName}/${dependency}`, dependency].find(
    (key) => packages[key] !== undefined,
  );
};

const everyDirectDependencyResolvesInsideItsRange = (world) =>
  pairedWorkspaces(world).flatMap(({ directory, locked }) =>
    INSTALLED_FIELDS.flatMap((field) =>
      Object.entries(rangesAt(locked, field))
        .filter(([, range]) => isInstallableRange(range))
        .filter(([name]) => !OVERRIDES_LAGGING_BEHIND_THEIR_MANIFESTS.includes(name))
        .flatMap(([name, range]) => {
          const key = resolutionKeyFor(world, String(locked.name ?? ''), name);
          if (key === undefined) {
            return [`${manifestPathOf(directory)} ${name}@${range} : aucune résolution dans bun.lock`];
          }
          const version = resolvedVersionOf(lockPackagesOf(world)[key]);
          return version === undefined || satisfies(version, range) !== false
            ? []
            : [`${manifestPathOf(directory)} ${name} : déclare ${range}, résout ${version}`];
        }),
    ),
  );

const trackedPackagesShareOneFloor = (world) =>
  TRACKED_PACKAGES.flatMap((dependency) => {
    const sites = declarationsOf(world, dependency);
    const floors = new Set(sites.map(({ range }) => floorOf(range)));
    return floors.size <= 1
      ? []
      : [
          `${dependency} est déclaré sur ${floors.size} planchers : ${sites
            .map(({ site, range }) => `${site}=${range}`)
            .join(' · ')}`,
        ];
  });

const trackedPackagesResolveOnce = (world) =>
  TRACKED_PACKAGES.flatMap((dependency) => {
    const versions = versionsResolvedFor(world, dependency);
    return versions.length === 1
      ? []
      : [`${dependency} est résolu ${versions.length} fois dans bun.lock : ${versions.join(', ')}`];
  });

const trackedPackagesSatisfyEverySite = (world) =>
  TRACKED_PACKAGES.flatMap((dependency) => {
    const [version] = versionsResolvedFor(world, dependency);
    return declarationsOf(world, dependency)
      .filter(({ range }) => isInstallableRange(range))
      .filter(({ range }) => version === undefined || satisfies(version, range) === false)
      .map(({ site, range }) => `${site} déclare ${range}, résolu ${version ?? '(rien)'}`);
  });

const overridesContradictingAManifest = (world) =>
  [
    ...new Set(
      Object.entries(rootOverridesOf(world)).flatMap(([name, pinned]) =>
        world.manifests.flatMap(({ document }) =>
          DEPENDENCY_FIELDS.flatMap((field) => {
            const range = rangesAt(document, field)[name];
            return range === undefined ||
              !isInstallableRange(range) ||
              !/^\d/.test(pinned) ||
              satisfies(pinned, range) !== false
              ? []
              : [name];
          }),
        ),
      ),
    ),
  ].sort();

const noUndeclaredOverrideContradictsAManifest = (world) =>
  overridesContradictingAManifest(world)
    .filter((name) => !OVERRIDES_LAGGING_BEHIND_THEIR_MANIFESTS.includes(name))
    .map(
      (name) =>
        `overrides ${name} est épinglé sous une portée déclarée par un workspace, sans être inscrit dans OVERRIDES_LAGGING_BEHIND_THEIR_MANIFESTS`,
    );

const everyDeclaredLaggardStillLags = (world) => {
  const contradicting = new Set(overridesContradictingAManifest(world));
  return OVERRIDES_LAGGING_BEHIND_THEIR_MANIFESTS.filter(
    (name) => !contradicting.has(name),
  ).map(
    (name) =>
      `overrides ${name} ne contredit plus aucun manifeste : retirer ${name} de OVERRIDES_LAGGING_BEHIND_THEIR_MANIFESTS`,
  );
};

const CHECKS = [
  ['chaque manifeste de workspace a son entrée dans bun.lock', everyWorkspaceOnDiskIsLocked],
  ['chaque workspace de bun.lock existe sur le disque', everyLockedWorkspaceIsOnDisk],
  ["bun.lock recopie le nom et la version de chaque manifeste", lockRepeatsTheIdentityOfEachManifest],
  ['bun.lock recopie les portées de chaque manifeste', lockRepeatsTheRangesOfEachManifest],
  ['bun.lock recopie les overrides de la racine', lockRepeatsTheOverridesOfTheRoot],
  [
    'chaque dépendance directe résout dans la portée déclarée',
    everyDirectDependencyResolvesInsideItsRange,
  ],
  ['un paquet suivi est déclaré sur UN plancher', trackedPackagesShareOneFloor],
  ['un paquet suivi est résolu à UNE version', trackedPackagesResolveOnce],
  ['un paquet suivi satisfait chaque site déclarant', trackedPackagesSatisfyEverySite],
  ['aucun override non déclaré ne contredit un manifeste', noUndeclaredOverrideContradictsAManifest],
  ['chaque retard déclaré est encore un retard', everyDeclaredLaggardStillLags],
];

const inspect = (world) =>
  CHECKS.flatMap(([title, check]) => check(world).map((failure) => `${title} → ${failure}`));

const mutate = (world, apply) => {
  const copy = structuredClone(world);
  apply(copy);
  return copy;
};

const MUTATIONS = [
  [
    "un manifeste de workspace que le lock n'a jamais vu",
    (world) => {
      world.manifests.push({
        directory: 'packages/zz-sonde',
        document: { name: '@meeshy/zz-sonde', version: '0.0.0' },
      });
    },
    'manifeste de workspace absent de bun.lock',
  ],
  [
    'une entrée de workspace retirée du lock',
    (world) => {
      delete world.lock.workspaces['apps/web'];
    },
    'manifeste de workspace absent de bun.lock',
  ],
  [
    'un workspace loqué mais absent du disque',
    (world) => {
      world.lock.workspaces['apps/zz-fantome'] = { name: '@meeshy/zz-fantome', version: '0.0.0' };
    },
    'bun.lock déclare un workspace absent du graphe sur disque',
  ],
  [
    'une version de manifeste que le lock ne suit pas',
    (world) => {
      world.lock.workspaces['apps/web'].version = '0.0.0-sonde';
    },
    'version : manifeste=',
  ],
  [
    'une portée de manifeste que le lock ne suit pas',
    (world) => {
      world.manifests.find(({ directory }) => directory === 'apps/web').document.dependencies[
        'idb-keyval'
      ] = '^0.0.1';
    },
    'idb-keyval : manifeste=^0.0.1',
  ],
  [
    'un override de la racine que le lock ne suit pas',
    (world) => {
      world.lock.overrides.react = '0.0.1';
    },
    'overrides react : package.json=',
  ],
  [
    'une résolution hors de la portée déclarée',
    (world) => {
      world.lock.packages.react = ['react@18.0.0', '', {}, 'sha512-sonde'];
    },
    'déclare 19.2.8, résout 18.0.0',
  ],
  [
    'un paquet suivi déclaré sur deux planchers',
    (world) => {
      world.manifests.find(({ directory }) => directory === 'packages/shared').document.devDependencies =
        {
          ...world.manifests.find(({ directory }) => directory === 'packages/shared').document
            .devDependencies,
          react: '^18.0.0',
        };
    },
    'react est déclaré sur 2 planchers',
  ],
  [
    'un paquet suivi résolu deux fois',
    (world) => {
      world.lock.packages['@meeshy/zz/react'] = ['react@18.0.0', '', {}, 'sha512-sonde'];
    },
    'react est résolu 2 fois',
  ],
  [
    'un override non déclaré qui contredit un manifeste',
    (world) => {
      const root = world.manifests.find(({ directory }) => directory === '');
      root.document.overrides = { ...root.document.overrides, 'idb-keyval': '1.0.0' };
    },
    'overrides idb-keyval est épinglé sous une portée déclarée',
  ],
  [
    'un retard déclaré qui a cessé de retarder',
    (world) => {
      const root = world.manifests.find(({ directory }) => directory === '');
      root.document.overrides = { ...root.document.overrides, postcss: '8.5.26' };
    },
    'overrides postcss ne contredit plus aucun manifeste',
  ],
];

const selfTest = (world) => {
  const blind = MUTATIONS.filter(
    ([, apply, expected]) =>
      !inspect(mutate(world, apply)).some((failure) => failure.includes(expected)),
  );
  blind.forEach(([title, , expected]) =>
    console.error(`AVEUGLE : « ${title} » n'a produit aucun échec contenant « ${expected} »`),
  );
  if (blind.length > 0) {
    console.error(`\n${blind.length}/${MUTATIONS.length} mutations passent sous le garde.`);
    return 1;
  }
  console.log(`self-test : ${MUTATIONS.length}/${MUTATIONS.length} mutations détectées.`);
  return 0;
};

const main = () => {
  const world = readWorld(REPO_ROOT);
  if (process.argv.includes('--self-test')) {
    return selfTest(world);
  }
  const failures = inspect(world);
  if (failures.length > 0) {
    failures.forEach((failure) => console.error(failure));
    console.error(
      `\n${failures.length} désalignement(s) entre bun.lock et les manifestes de workspace.`,
    );
    console.error("Rejouer : bun install --ignore-scripts, puis committer bun.lock avec l'arbre qu'il décrit.");
    return 1;
  }
  console.log(
    `bun.lock est aligné sur les ${world.manifests.length} manifestes de workspace déclarés par la racine.`,
  );
  return 0;
};

process.exit(main());
